// AuraSync animated splash — compiled to assets/aurasync-splash.exe by
// scripts/patch-portable-splash.js. Shows a premium dark-glass pill with the
// AuraSync logo + name (soft float, shine sweep, loading dots), true per-pixel
// transparency, always-on-top and non-activating. It closes itself as soon as
// the setup's own AuraSync process appears (pre-existing user instances ignored).
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

class AuraSplash
{
    [StructLayout(LayoutKind.Sequential)]
    struct POINT { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    struct SIZE { public int cx; public int cy; }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    struct BLENDFUNCTION
    {
        public byte BlendOp;
        public byte BlendFlags;
        public byte SourceConstantAlpha;
        public byte AlphaFormat;
    }

    const int ULW_ALPHA = 2;
    const byte AC_SRC_OVER = 0;
    const byte AC_SRC_ALPHA = 1;
    const int GWL_EXSTYLE = -20;
    const int WS_EX_LAYERED = 0x00080000;
    const int WS_EX_TOOLWINDOW = 0x00000080;

    const int W = 620;
    const int H = 180;

    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    [DllImport("user32.dll")] static extern bool UpdateLayeredWindow(
        IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize,
        IntPtr hdcSrc, ref POINT pptSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr hDC);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr hObject);

    class SplashForm : Form
    {
        protected override bool ShowWithoutActivation { get { return true; } }
        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= WS_EX_TOOLWINDOW;
                return cp;
            }
        }
    }

    static GraphicsPath RoundRect(RectangleF r, float radius)
    {
        GraphicsPath p = new GraphicsPath();
        float d = radius * 2f;
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    static int F(float alpha, float fade)
    {
        int a = (int)(alpha * fade);
        if (a < 0) a = 0;
        if (a > 255) a = 255;
        return a;
    }

    static GraphicsPath CloudPath(float x, float y, float s)
    {
        GraphicsPath p = new GraphicsPath();
        p.AddEllipse(x, y + 10 * s, 28 * s, 26 * s);
        p.AddEllipse(x + 12 * s, y, 34 * s, 32 * s);
        p.AddEllipse(x + 30 * s, y + 8 * s, 26 * s, 24 * s);
        p.AddEllipse(x + 6 * s, y + 20 * s, 46 * s, 16 * s);
        return p;
    }

    static void RenderFrame(Bitmap frame, float t, float scale, Font font, float textWidth, int logoX, int textX, int dotsX)
    {
        float fade = Math.Min(1f, t / 0.45f);
        int rise = (int)((1f - fade) * 10f);

        using (Graphics g = Graphics.FromImage(frame))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.AntiAlias;
            g.Clear(Color.Transparent);
            g.ScaleTransform(scale, scale);

            // Drifting soft clouds behind the name (cloud-backup theme)
            {
                float span = W + 340;
                float cx1 = -280 + ((t * 24) % span);
                float cy1 = H / 2f - 66 + (float)Math.Sin(t * 0.7) * 6;
                using (GraphicsPath c1 = CloudPath(cx1, cy1, 1.7f))
                using (SolidBrush b1 = new SolidBrush(Color.FromArgb(F(17f, fade), 255, 255, 255)))
                {
                    g.FillPath(b1, c1);
                }

                float cx2 = W + 280 - ((t * 15) % span);
                float cy2 = H / 2f + 6 + (float)Math.Sin(t * 0.5 + 2) * 5;
                using (GraphicsPath c2 = CloudPath(cx2, cy2, 1.05f))
                using (SolidBrush b2 = new SolidBrush(Color.FromArgb(F(15f, fade), 195, 222, 255)))
                {
                    g.FillPath(b2, c2);
                }

                float cx3 = -280 + ((t * 38 + 420) % span);
                float cy3 = H / 2f + 34 + (float)Math.Sin(t * 0.9 + 4) * 4;
                using (GraphicsPath c3 = CloudPath(cx3, cy3, 0.62f))
                using (SolidBrush b3 = new SolidBrush(Color.FromArgb(F(13f, fade), 255, 255, 255)))
                {
                    g.FillPath(b3, c3);
                }
            }

            // Just the animated name — no logo (by request)
            float floatY = (float)Math.Sin(t * 2.1) * 2f;
            float rowCenterY = H / 2f + rise + floatY;

            float textTop = rowCenterY - 19f;

            using (GraphicsPath textPath = new GraphicsPath())
            {
                StringFormat fmt = StringFormat.GenericTypographic;
                textPath.AddString("AuraSync", font.FontFamily, (int)font.Style, font.Size,
                    new PointF(textX, textTop), fmt);

                // Dark soft outline: keeps the name readable on any wallpaper
                using (Pen op = new Pen(Color.FromArgb(F(165f, fade), 2, 8, 20), 6f))
                {
                    op.LineJoin = LineJoin.Round;
                    g.DrawPath(op, textPath);
                }

                // Gradient fill
                RectangleF textRect = new RectangleF(textX, textTop - 5, textWidth + 12, 62);
                using (LinearGradientBrush tb = new LinearGradientBrush(
                    textRect, Color.FromArgb(F(252f, fade), 255, 255, 255),
                    Color.FromArgb(F(252f, fade), 205, 226, 255), 90f))
                {
                    g.FillPath(tb, textPath);
                }

                // Shine sweep across the name
                float period = 2.4f;
                float progress = (t % period) / period;
                float bandX = textX - 130 + progress * (textWidth + 260);
                Region oldClip = g.Clip;
                g.SetClip(textPath);
                RectangleF band = new RectangleF(bandX, textTop - 10, 110, 62);
                using (LinearGradientBrush sh = new LinearGradientBrush(
                    band, Color.FromArgb(0, 255, 255, 255), Color.FromArgb(0, 255, 255, 255), 0f))
                {
                    ColorBlend blend = new ColorBlend(3);
                    blend.Colors = new Color[]
                    {
                        Color.FromArgb(0, 255, 255, 255),
                        Color.FromArgb(F(115f, fade), 255, 255, 255),
                        Color.FromArgb(0, 255, 255, 255)
                    };
                    blend.Positions = new float[] { 0f, 0.5f, 1f };
                    sh.InterpolationColors = blend;
                    g.FillRectangle(sh, band);
                }
                g.Clip = oldClip;
            }

            // Loading dots — centered under the name
            float dotsCenterX = (W - 34f) / 2f;
            for (int i = 0; i < 3; i++)
            {
                float phase = t * 4.2f - i * 0.9f;
                float a = 70f + 150f * (0.5f + 0.5f * (float)Math.Sin(phase));
                using (SolidBrush db = new SolidBrush(Color.FromArgb(F(a, fade), 111, 168, 255)))
                {
                    g.FillEllipse(db, dotsCenterX + i * 13, rowCenterY + 38f, 8, 8);
                }
            }
        }
    }

    [STAThread]
    static void Main()
    {
        try
        {
            SetProcessDPIAware();
            Application.EnableVisualStyles();

            float scale = 1f;
            using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) { scale = g.DpiX / 96f; }
            int pw = (int)Math.Round(W * scale);
            int ph = (int)Math.Round(H * scale);

            Bitmap frame = new Bitmap(pw, ph, PixelFormat.Format32bppArgb);

            Font font = new Font("Segoe UI", 34f, FontStyle.Bold, GraphicsUnit.Pixel);
            float textWidth;
            using (Graphics mg = Graphics.FromImage(frame))
            {
                textWidth = mg.MeasureString("AuraSync", font, 1000, StringFormat.GenericTypographic).Width;
            }

            float rowWidth = textWidth;
            float startX = (W - rowWidth) / 2f;
            int logoX = 0;
            int textX = (int)startX;
            int dotsX = 0;

            Rectangle work = Screen.PrimaryScreen.WorkingArea;
            int left = work.Left + (work.Width - pw) / 2;
            int top = work.Top + (work.Height - ph) / 2;

            SplashForm f = new SplashForm();
            f.FormBorderStyle = FormBorderStyle.None;
            f.StartPosition = FormStartPosition.Manual;
            f.ShowInTaskbar = false;
            f.TopMost = true;
            f.Bounds = new Rectangle(left, top, pw, ph);
            f.Show();

            int exStyle = GetWindowLong(f.Handle, GWL_EXSTYLE);
            SetWindowLong(f.Handle, GWL_EXSTYLE, exStyle | WS_EX_LAYERED | WS_EX_TOOLWINDOW);

            IntPtr screenDc = GetDC(IntPtr.Zero);
            IntPtr memDc = CreateCompatibleDC(screenDc);
            POINT dest = new POINT(); dest.X = left; dest.Y = top;
            SIZE size = new SIZE(); size.cx = pw; size.cy = ph;
            POINT srcPt = new POINT(); srcPt.X = 0; srcPt.Y = 0;
            BLENDFUNCTION blend = new BLENDFUNCTION();
            blend.BlendOp = AC_SRC_OVER;
            blend.BlendFlags = 0;
            blend.SourceConstantAlpha = 255;
            blend.AlphaFormat = AC_SRC_ALPHA;

            // Only close when a NEW AuraSync process appears (ignore instances
            // the user already had running before the setup started).
            System.Collections.Generic.HashSet<int> preexisting = new System.Collections.Generic.HashSet<int>();
            foreach (Process existing in Process.GetProcessesByName("AuraSync"))
            {
                try { preexisting.Add(existing.Id); } catch { }
            }

            Stopwatch sw = Stopwatch.StartNew();
            while (sw.ElapsedMilliseconds < 180000)
            {
                float t = sw.ElapsedMilliseconds / 1000f;
                RenderFrame(frame, t, scale, font, textWidth, logoX, textX, dotsX);

                IntPtr hBitmap = frame.GetHbitmap(Color.FromArgb(0));
                IntPtr oldBitmap = SelectObject(memDc, hBitmap);
                UpdateLayeredWindow(f.Handle, screenDc, ref dest, ref size, memDc, ref srcPt, 0, ref blend, ULW_ALPHA);
                SelectObject(memDc, oldBitmap);
                DeleteObject(hBitmap);

                Application.DoEvents();
                Thread.Sleep(16);

                bool started = false;
                try
                {
                    foreach (Process candidate in Process.GetProcessesByName("AuraSync"))
                    {
                        try
                        {
                            if (!preexisting.Contains(candidate.Id)) { started = true; break; }
                        }
                        catch { }
                    }
                }
                catch { }
                if (started) break;
            }

            DeleteDC(memDc);
            ReleaseDC(IntPtr.Zero, screenDc);
            try { f.Close(); } catch { }
        }
        catch (Exception ex)
        {
            try
            {
                File.AppendAllText(
                    Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "aurasync-splash-error.log"),
                    ex.ToString());
            }
            catch { }
        }
    }
}
