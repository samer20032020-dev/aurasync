"""
AuraSync — Elite Master PowerPoint Presentation Generator (v2.0)
Generates an ultra-premium, 18-slide 16:9 widescreen, dark-luxury-themed PowerPoint (.pptx)
featuring the complete architectural, functional, security, enterprise ROI, and roadmap dimensions of AuraSync.
Includes comprehensive bilingual Speaker Notes for every slide, interactive diagrams, metrics, and high-res visual assets.
"""

import os
import json
import pptx
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

# -------------------------------------------------------------
# Color Palette Definition (Dark Luxury Cyber-Aesthetic)
# -------------------------------------------------------------
C_BG = RGBColor(7, 10, 19)            # Deep obsidian navy (#070a13)
C_CARD_BG = RGBColor(13, 21, 39)       # Frosted card surface
C_CARD_BORDER = RGBColor(30, 48, 80)   # Subtle blue borders
C_CYAN = RGBColor(6, 182, 212)         # Electric cyan (#06b6d4)
C_BLUE = RGBColor(37, 99, 235)         # Royal blue (#2563eb)
C_EMERALD = RGBColor(16, 185, 129)     # Vibrant emerald (#10b981)
C_AMBER = RGBColor(245, 158, 11)       # Warning / highlight amber (#f59e0b)
C_PURPLE = RGBColor(168, 85, 247)      # Vault purple (#a855f7)
C_ROSE = RGBColor(244, 63, 94)         # Danger / alert rose (#f43f5e)
C_TEXT_WHITE = RGBColor(248, 250, 252) # Ice white text
C_TEXT_MUTED = RGBColor(148, 163, 184) # Slate muted text
C_ACCENT_BG = RGBColor(15, 28, 56)

FONT_HEADING = 'Segoe UI'
FONT_BODY = 'Segoe UI'

# -------------------------------------------------------------
# Dynamic Version Discovery
# -------------------------------------------------------------
def get_project_versions():
    ver_path = 'version.json'
    desktop_ver = '1.7.96'
    mobile_ver = '1.0.6'
    if os.path.exists(ver_path):
        try:
            with open(ver_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                desktop_ver = data.get('desktopVersion', data.get('version', desktop_ver))
                mobile_ver = data.get('mobileVersion', mobile_ver)
        except Exception:
            pass
    return desktop_ver, mobile_ver

DESKTOP_VER, MOBILE_VER = get_project_versions()

# -------------------------------------------------------------
# Helper Functions
# -------------------------------------------------------------
def create_base_presentation():
    prs = pptx.Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    return prs

def set_slide_background(slide):
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
    bg.fill.solid()
    bg.fill.fore_color.rgb = C_BG
    bg.line.color.rgb = C_BG
    return bg

def add_header(slide, title, category="AURASYNC ARCHITECTURE", subtitle=None):
    # Category / Tag Pill
    tag_box = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(0.38), Inches(3.4), Inches(0.35))
    tag_box.fill.solid()
    tag_box.fill.fore_color.rgb = C_ACCENT_BG
    tag_box.line.color.rgb = C_CYAN
    tag_box.line.width = Pt(1)
    tf_tag = tag_box.text_frame
    tf_tag.vertical_anchor = MSO_ANCHOR.MIDDLE
    p_tag = tf_tag.paragraphs[0]
    p_tag.text = category
    p_tag.font.name = FONT_HEADING
    p_tag.font.size = Pt(9.5)
    p_tag.font.bold = True
    p_tag.font.color.rgb = C_CYAN
    p_tag.alignment = PP_ALIGN.CENTER

    # Main Title (Right-to-Left Arabic alignment)
    tb = slide.shapes.add_textbox(Inches(0.8), Inches(0.80), Inches(11.733), Inches(0.75))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.name = FONT_HEADING
    p.font.size = Pt(21)
    p.font.bold = True
    p.font.color.rgb = C_TEXT_WHITE
    p.alignment = PP_ALIGN.RIGHT

    # Subtitle if provided
    if subtitle:
        p_sub = tf.add_paragraph()
        p_sub.text = subtitle
        p_sub.font.name = FONT_BODY
        p_sub.font.size = Pt(11.5)
        p_sub.font.color.rgb = C_TEXT_MUTED
        p_sub.alignment = PP_ALIGN.RIGHT
        p_sub.space_before = Pt(3)

    # Top right mini brand icon
    icon_path = 'website/assets/app-icon.png'
    if os.path.exists(icon_path):
        slide.shapes.add_picture(icon_path, Inches(12.1), Inches(0.38), Inches(0.6), Inches(0.6))

def add_card(slide, left, top, width, height, title, items, border_color=C_CARD_BORDER, icon=None, badge=None):
    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height))
    card.fill.solid()
    card.fill.fore_color.rgb = C_CARD_BG
    card.line.color.rgb = border_color
    card.line.width = Pt(1.5)

    tf = card.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.2)
    tf.margin_right = Inches(0.2)
    tf.margin_top = Inches(0.16)
    tf.margin_bottom = Inches(0.14)

    p_title = tf.paragraphs[0]
    prefix = f"{icon} " if icon else ""
    p_title.text = f"{prefix}{title}"
    p_title.font.name = FONT_HEADING
    p_title.font.size = Pt(13)
    p_title.font.bold = True
    p_title.font.color.rgb = C_TEXT_WHITE if border_color == C_CARD_BORDER else border_color
    p_title.alignment = PP_ALIGN.RIGHT

    if badge:
        p_badge = tf.add_paragraph()
        p_badge.text = f"[{badge}]"
        p_badge.font.name = FONT_BODY
        p_badge.font.size = Pt(9)
        p_badge.font.bold = True
        p_badge.font.color.rgb = border_color
        p_badge.alignment = PP_ALIGN.RIGHT
        p_badge.space_before = Pt(2)

    for item in items:
        p = tf.add_paragraph()
        p.text = f"• {item}"
        p.font.name = FONT_BODY
        p.font.size = Pt(10)
        p.font.color.rgb = C_TEXT_MUTED
        p.alignment = PP_ALIGN.RIGHT
        p.space_before = Pt(3)
        p.space_after = Pt(1)

    return card

def add_step_card(slide, left, top, width, height, step_num, title, text, color=C_CYAN):
    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height))
    card.fill.solid()
    card.fill.fore_color.rgb = C_CARD_BG
    card.line.color.rgb = color
    card.line.width = Pt(1.5)

    tf = card.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.18)
    tf.margin_right = Inches(0.18)
    tf.margin_top = Inches(0.16)
    tf.margin_bottom = Inches(0.14)

    p_step = tf.paragraphs[0]
    p_step.text = f"STEP {step_num}"
    p_step.font.name = FONT_HEADING
    p_step.font.size = Pt(11)
    p_step.font.bold = True
    p_step.font.color.rgb = color
    p_step.alignment = PP_ALIGN.RIGHT

    p_title = tf.add_paragraph()
    p_title.text = title
    p_title.font.name = FONT_HEADING
    p_title.font.size = Pt(12.5)
    p_title.font.bold = True
    p_title.font.color.rgb = C_TEXT_WHITE
    p_title.alignment = PP_ALIGN.RIGHT
    p_title.space_before = Pt(2)

    p_body = tf.add_paragraph()
    p_body.text = text
    p_body.font.name = FONT_BODY
    p_body.font.size = Pt(9.5)
    p_body.font.color.rgb = C_TEXT_MUTED
    p_body.alignment = PP_ALIGN.RIGHT
    p_body.space_before = Pt(4)

    return card

def add_stat_box(slide, left, top, width, height, number, label, subtext="", color=C_CYAN):
    box = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height))
    box.fill.solid()
    box.fill.fore_color.rgb = RGBColor(12, 18, 33)
    box.line.color.rgb = color
    box.line.width = Pt(1.5)

    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_top = Inches(0.12)
    tf.margin_bottom = Inches(0.1)

    p_num = tf.paragraphs[0]
    p_num.text = number
    p_num.font.name = FONT_HEADING
    p_num.font.size = Pt(20)
    p_num.font.bold = True
    p_num.font.color.rgb = color
    p_num.alignment = PP_ALIGN.CENTER

    p_lbl = tf.add_paragraph()
    p_lbl.text = label
    p_lbl.font.name = FONT_HEADING
    p_lbl.font.size = Pt(10.5)
    p_lbl.font.bold = True
    p_lbl.font.color.rgb = C_TEXT_WHITE
    p_lbl.alignment = PP_ALIGN.CENTER
    p_lbl.space_before = Pt(2)

    if subtext:
        p_sub = tf.add_paragraph()
        p_sub.text = subtext
        p_sub.font.name = FONT_BODY
        p_sub.font.size = Pt(8.5)
        p_sub.font.color.rgb = C_TEXT_MUTED
        p_sub.alignment = PP_ALIGN.CENTER
        p_sub.space_before = Pt(2)

def add_image_card(slide, img_path, left, top, width, height, caption=None, border_color=C_CYAN):
    frame = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height))
    frame.fill.solid()
    frame.fill.fore_color.rgb = C_CARD_BG
    frame.line.color.rgb = border_color
    frame.line.width = Pt(1.5)

    pad = 0.08
    if os.path.exists(img_path):
        slide.shapes.add_picture(
            img_path, 
            Inches(left + pad), 
            Inches(top + pad), 
            Inches(width - 2*pad), 
            Inches(height - (0.42 if caption else 2*pad))
        )
    
    if caption:
        tb = slide.shapes.add_textbox(Inches(left), Inches(top + height - 0.40), Inches(width), Inches(0.35))
        tf = tb.text_frame
        p = tf.paragraphs[0]
        p.text = caption
        p.font.name = FONT_BODY
        p.font.size = Pt(9.5)
        p.font.bold = True
        p.font.color.rgb = C_TEXT_WHITE
        p.alignment = PP_ALIGN.CENTER

def add_speaker_notes(slide, notes_text):
    notes_slide = slide.notes_slide
    tf = notes_slide.notes_text_frame
    tf.text = notes_text

# -------------------------------------------------------------
# SLIDE BUILDERS (18 Master Slides)
# -------------------------------------------------------------

def build_slide_1(prs):
    # Slide 1: Cover Slide
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)

    hero_path = 'website/assets/hero-vault.jpg'
    add_image_card(slide, hero_path, 0.8, 1.2, 5.2, 5.5, caption="AuraSync Digital Cloud Vault — 8K 3D Architecture", border_color=C_CYAN)

    tag = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.4), Inches(1.2), Inches(3.6), Inches(0.4))
    tag.fill.solid()
    tag.fill.fore_color.rgb = RGBColor(16, 28, 56)
    tag.line.color.rgb = C_CYAN
    tf_tag = tag.text_frame
    tf_tag.vertical_anchor = MSO_ANCHOR.MIDDLE
    p_t = tf_tag.paragraphs[0]
    p_t.text = "OFFICIAL PROJECT PRESENTATION 2026"
    p_t.font.name = FONT_HEADING
    p_t.font.size = Pt(10)
    p_t.font.bold = True
    p_t.font.color.rgb = C_CYAN
    p_t.alignment = PP_ALIGN.CENTER

    tb = slide.shapes.add_textbox(Inches(6.4), Inches(1.75), Inches(6.1), Inches(2.2))
    tf = tb.text_frame
    tf.word_wrap = True
    p1 = tf.paragraphs[0]
    p1.text = "AuraSync — مشروع سحابه"
    p1.font.name = FONT_HEADING
    p1.font.size = Pt(32)
    p1.font.bold = True
    p1.font.color.rgb = C_TEXT_WHITE
    p1.alignment = PP_ALIGN.RIGHT

    p2 = tf.add_paragraph()
    p2.text = "المنصة الهندسية الذكية للنسخ الاحتياطي متعدد السحابات وحماية البيانات بسياسة انعدام الحذف"
    p2.font.name = FONT_BODY
    p2.font.size = Pt(14)
    p2.font.color.rgb = C_CYAN
    p2.alignment = PP_ALIGN.RIGHT
    p2.space_before = Pt(8)

    p3 = tf.add_paragraph()
    p3.text = "منظومة إنتاجية متكاملة تجمع بين سياسة انعدام الحذف الحصرية، ودمج أكثر من 25 سحابة، وحارس المتصفحات المبتكر Win+L، وتطبيق أندرويد مستقل لنقل المعرض بنقرة واحدة."
    p3.font.name = FONT_BODY
    p3.font.size = Pt(10.5)
    p3.font.color.rgb = C_TEXT_MUTED
    p3.alignment = PP_ALIGN.RIGHT
    p3.space_before = Pt(6)

    add_stat_box(slide, 6.4, 4.3, 1.4, 1.2, "+25", "سحابة مدعومة", "دمج موحد شامل", C_CYAN)
    add_stat_box(slide, 7.95, 4.3, 1.4, 1.2, "0%", "حذف عَرَضي", "سياسة عدم الحذف", C_EMERALD)
    add_stat_box(slide, 9.5, 4.3, 1.4, 1.2, "32x", "قناة توازي", "توربو الفايبر", C_AMBER)
    add_stat_box(slide, 11.05, 4.3, 1.4, 1.2, "100%", "جناح اختبارات", "382+ فحص مؤتمت", C_PURPLE)

    meta = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.4), Inches(5.8), Inches(6.05), Inches(0.85))
    meta.fill.solid()
    meta.fill.fore_color.rgb = RGBColor(11, 16, 30)
    meta.line.color.rgb = C_CARD_BORDER
    tf_meta = meta.text_frame
    tf_meta.word_wrap = True
    p_m1 = tf_meta.paragraphs[0]
    p_m1.text = f"Desktop v{DESKTOP_VER} (Electron + SQLite WASM)  |  Mobile v{MOBILE_VER} (Android APK Native)"
    p_m1.font.name = FONT_HEADING
    p_m1.font.size = Pt(10)
    p_m1.font.bold = True
    p_m1.font.color.rgb = C_TEXT_WHITE
    p_m1.alignment = PP_ALIGN.CENTER
    p_m2 = tf_meta.add_paragraph()
    p_m2.text = "Commercial Grade Architecture  •  Principal Software Architect Standard"
    p_m2.font.name = FONT_BODY
    p_m2.font.size = Pt(9)
    p_m2.font.color.rgb = C_CYAN
    p_m2.alignment = PP_ALIGN.CENTER
    p_m2.space_before = Pt(3)

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 1:30 دقيقة]:\n"
        "• مرحباً بالحضور الكريم. اليوم نقدم لكم مشروع AuraSync (سحابه)، المشروع الذي يعيد تعريف مفهوم النسخ الاحتياطي السحابي والأمن السيبراني للأفراد والشركات.\n"
        "• في عالم تضيع فيه ملفات الملايين يومياً بسبب أخطاء الحذف المتزامن التبادلي أو هجمات الفدية، ابتكرنا منصة هجينة مستقلة بالكامل تجمع بين بيئة سطح المكتب الاحترافية وتطبيق الهاتف الذكي الأصلي.\n"
        "• لدينا اليوم أكثر من 25 سحابة وبروتوكول قياسي مدمجين في واجهة واحدة، وسياسة انعدام الحذف التي تضمن بقاء ملفاتك إلى الأبد، مع حارس المتصفحات المبتكر الذي يقفل نظام ويندوز بعد خطأين لحماية الخصوصية."
    )

def build_slide_2(prs):
    # Slide 2: The Core Problem & Market Gap
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "معضلة فقدان البيانات ومخاطر السحابة التقليدية", "THE MARKET PROBLEM & CRITICAL GAP", "تحليل الثغرات الكارثية في خدمات التخزين السحابي الحالية وسلوك المستخدمين")

    add_card(slide, 0.8, 1.8, 5.6, 2.4, "كارثة الحذف المتزامن التبادلي", [
        "في Google Drive و OneDrive و Dropbox، إذا حذفت ملفاً من حاسوبك بالخطأ، تحذفه السحابة فوراً من كافة أجهزتك!",
        "برمجيات الفدية (Ransomware): بمجرد تشفير الملفات محلياً، تقوم المزامنة العادية باستبدال النسخ السليمة في السحابة فوراً.",
        "انعدام الحماية التلقائية للبيانات المحذوفة محلياً دون اشتراكات مؤسسية باهظة."
    ], border_color=C_ROSE, icon="⚠️", badge="مخاطرة فقدان قصوى")

    add_card(slide, 6.8, 1.8, 5.7, 2.4, "تشتت التخزين واحتكار الشركات (Vendor Lock-in)", [
        "يمتلك المستخدم العادي 15GB في جوجل، 5GB في ون درايف، و 20GB في ميجا دون أي رابط بينها.",
        "الشركات تجبر المستخدم على شراء اشتراكات شهرية متكررة عند امتلاء حساب واحد.",
        "استحالة نقل الملفات مباشرة من سحابة إلى سحابة أخرى دون تنزيلها أولاً على القرص الصلب."
    ], border_color=C_AMBER, icon="🔒", badge="احتكار وتكاليف باهظة")

    add_card(slide, 0.8, 4.5, 5.6, 2.3, "أزمة ذاكرة الهواتف الذكية والمعرض", [
        "امتلاء ذاكرة الهاتف بآلاف الصور والفيديوهات دون وجود أداة بنقرة واحدة لنقل المعرض بالكامل لسحابة خاصة.",
        "قيود رفع المعرض دفعة واحدة: أغلب التطبيقات تنهار عند محاولة مشاركة أكثر من 50-100 صورة معاً.",
        "الاستنزاف السريع لبطارية الهاتف وباقة البيانات الخلوية أثناء عمليات المزامنة العشوائية."
    ], border_color=C_BLUE, icon="📱", badge="اختناق تخزين الهواتف")

    add_card(slide, 6.8, 4.5, 5.7, 2.3, "مخاطر الخصوصية وتطفل الأجهزة المفتوحة", [
        "ترك أجهزة الكمبيوتر أو الهواتف في المكاتب والمنازل يُعرّض الحسابات والواتساب والبريد للتطفل المباشر.",
        "المتصفحات الحديثة تحفظ الجلسات مفتوحة دون أي طلب لرمز PIN أو بصمة عند التبديل للنوافذ.",
        "غياب التشفير الحقيقي للمجلدات الحساسة قبل رفعها إلى الخوادم السحابية الأمريكية."
    ], border_color=C_PURPLE, icon="👁️", badge="انكشاف الخصوصية")

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 2:00 دقيقة]:\n"
        "• اسأل الحضور: كم واحد منكم حذف مجلد بالخطأ واكتشف أن جوجل درايف أو ون درايف حذفه فوراً من السحابة وهاتفه أيضاً؟\n"
        "• هذه هي المعضلة الأساسية الأولى: 'المزامنة ثنائية الاتجاه' هي أكبر كذبة أمنية، لأنها تحول خطأ المستخدم البسيط إلى كارثة فقدان نهائية.\n"
        "• المشكلة الثانية هي احتكار الشركات وتشتت الجيجابايتات المجانية بين المنصات، بالإضافة لأزمة امتلاء ذاكرة الهواتف بالصور، وانكشاف المتصفحات المفتوحة في المكاتب والمنازل."
    )

def build_slide_3(prs):
    # Slide 3: The AuraSync Solution & Strategic Pillars
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "الحل الثوري: منصة AuraSync الهجينة الذكية", "THE AURASYNC STRATEGIC SOLUTION", "منظومة متكاملة لحفظ الملفات وتوحيد السحابات وتأمين النظام على مستوى النواة")

    shield_path = 'website/assets/security-shield.jpg'
    add_image_card(slide, shield_path, 0.8, 1.8, 4.0, 5.0, caption="Military-Grade Zero-Knowledge Defense Shield", border_color=C_CYAN)

    add_card(slide, 5.1, 1.8, 7.4, 1.15, "1. سياسة انعدام الحذف نهائياً (Zero-Deletion Policy)", [
        "الملف المحذوف محلياً يظل محفوظاً في السحابة بأمان 100% مع شارة تنبيه برتقالية وإمكانية استرجاعه بنقرة زر."
    ], border_color=C_EMERALD, icon="🛡️")

    add_card(slide, 5.1, 3.1, 7.4, 1.15, "2. مُجمّع السحابات الشامل (Universal Cloud Aggregator)", [
        "ربط وإدارة +25 سحابة وبروتوكول قياسي مع محرك نقل مباشر بين السحابات دون استهلاك مساحة القرص."
    ], border_color=C_CYAN, icon="☁️")

    add_card(slide, 5.1, 4.4, 7.4, 1.15, "3. حارس المتصفحات المبتكر والأمان السيبراني (Browser Guard & Vault)", [
        "قفل فوري للمتصفحات (Chrome, Edge, Brave...) برمز PIN مع حماية قفل الجهاز بالكامل Win+L بعد خطأين."
    ], border_color=C_PURPLE, icon="🔐")

    add_card(slide, 5.1, 5.7, 7.4, 1.15, "4. سرعة الفايبر واستعادة الكوارث (Turbo Concurrency & Disaster Recovery)", [
        "محرك توازي يصل إلى 32 عاملاً لاستغلال خطوط الفايبر، واستعادة الحاسوب بالكامل بعد الفورمات بضغطة زر."
    ], border_color=C_AMBER, icon="⚡")

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 1:45 دقيقة]:\n"
        "• استجابة لهذه التحديات، جاء AuraSync بـ 4 ركائز معمارية رئيسية:\n"
        "1. أولاً: سياسة انعدام الحذف — محرك ذكي يراقب النظام ويمنع حذف أي ملف سحابي مهما حدث محلياً.\n"
        "2. ثانياً: تجميع أكثر من 25 سحابة في منصة واحدة موحدة مع ميزة النقل المباشر من سحابة لأخرى في الرام.\n"
        "3. ثالثاً: حارس المتصفحات المبتكر Win+L الذي يقفل المتصفحات ويقفل نظام ويندوز عند محاولات التطفل.\n"
        "4. رابعاً: محرك التوربو فائق السرعة واستعادة الجهاز بالكامل بعد الفورمات بملف البصمة السحابية."
    )

def build_slide_4(prs):
    # Slide 4: Zero-Deletion Policy Architecture (With Process Steps)
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "الجوهرة الهندسية: سياسة انعدام الحذف (Zero-Deletion Policy)", "CORE ARCHITECTURAL ADVANTAGE", "كيف تضمن AuraSync بقاء ملفاتك محمية للأبد حتى لو تم مسحها محلياً؟")

    # 4 Sequential Steps (Top Row)
    step_w = 2.75
    add_step_card(slide, 0.8, 1.8, step_w, 2.2, "01", "رصد الحذف المحلي", "محرك Chokidar على مستوى النواة يلتقط حدث الحذف (unlink) في أقل من 5 ميلي ثانية.", C_CYAN)
    add_step_card(slide, 3.75, 1.8, step_w, 2.2, "02", "تجميد أوامر السحابة", "إلغاء فوري لإرسال أي طلب Delete API إلى خوادم Google أو Microsoft أو Dropbox.", C_EMERALD)
    add_step_card(slide, 6.7, 1.8, step_w, 2.2, "03", "الوسم الآمن بقاعدة البيانات", "تحديث حالة السجل إلى (preserved) وتسجيل البصمة الرقمية وتوقيت الحذف بدقة.", C_AMBER)
    add_step_card(slide, 9.65, 1.8, step_w, 2.2, "04", "التنبيه والاسترجاع", "ظهور شارة تنبيه برتقالية في الشريط الجانبي مع إمكانية استرجاع الملف أو الكل بضغطة زر.", C_PURPLE)

    # 2 Bottom Detail Cards
    add_card(slide, 0.8, 4.3, 5.7, 2.5, "الحذف المشترك المتعمد (Dual Joint Delete)", [
        "ماذا لو أراد المستخدم حذف ملف بشكل نهائي وحقيقي من الكمبيوتر والسحابة معاً؟",
        "يتوفر خيار حصري 'حذف من الجهاز والسحابة معاً' عبر قائمة كليك يمين في ويندوز وداخل واجهة البرنامج.",
        "نافذة تأكيد أمنية ذكية تمنع الحذف غير المقصود وتنفذ العملية بالتوازي فوراً على الطرفين.",
        "التحكم الكامل يظل دائماً بيد المستخدم دون مفاجآت غير متوقعة."
    ], border_color=C_CYAN, icon="🗑️", badge="تحكم سيادي كامل")

    add_card(slide, 6.8, 4.3, 5.7, 2.5, "الحصانة من برمجيات الفدية والأخطاء البشرية", [
        "أمان 100% ضد مسح المجلدات العرضي (Accidental Shift + Delete).",
        "حصانة برمجيات الفدية: إذا قام فيروس بتشفير الملفات أو مسحها محلياً، تظل النسخ السحابية سليمة 100%.",
        "أزرار الإدارة الجماعية: زر 'تنزيل الكل' لإعادة كافة المحذوفات أو 'مسح الكل' بقرار حاسم بنقرة واحدة.",
        "تفريغ تلقائي لسلة المهملات وضمان دقة كوتا التخزين السحابية."
    ], border_color=C_BLUE, icon="🛡️", badge="حصانة سيبرانية")

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 2:00 دقيقة]:\n"
        "• اشرح الخطوات الأربع في الأعلى: كيف يلتقط البرنامج حذف الملف في 5 ميلي ثانية، ويجمد أوامر السحابة فوراً، ثم يسجله كملف محفوظ (Preserved).\n"
        "• أكد على الفرق الجوهري: في البرامج العادية، حذف الملف = حذفه من السحابة. في AuraSync، حذف الملف = تحوله إلى أصل محفوظ بأمان مع تنبيه بصري هادئ.\n"
        "• إذا أراد المستخدم حذفه حقيقة، وفرنا له الحذف المشترك المتعمد عبر كليك يمين أو الواجهة بنقرة تأكيد واعية."
    )

def build_slide_5(prs):
    # Slide 5: Universal Cloud Ecosystem & Direct Transfer
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "سحابة واحدة تجمع كل السحابات: دعم +25 منصة وبروتوكول", "UNIVERSAL CLOUD ECOSYSTEM", "توحيد حساباتك السحابية المشتتة تحت مظلة أمنية واحدة مع ميزة النقل السحابي المباشر")

    add_card(slide, 0.8, 1.8, 3.7, 3.4, "السحابات الاستهلاكية الكبرى", [
        "Google Drive (مع دعم كاش المجلدات لمنع حظر الـ API)",
        "Microsoft OneDrive (دعم كامل لحسابات Personal & Business)",
        "Dropbox (تكامل مباشر عبر API v2)",
        "Box & pCloud (مزامنة فورية للملفات الضخمة)"
    ], border_color=C_CYAN, icon="🌐", badge="Native OAuth 2.0")

    add_card(slide, 4.8, 1.8, 3.7, 3.4, "السحابات المشفرة والخاصة", [
        "Mega.nz (تشفير طرف لطرف مع تجاوز قيود التحميل)",
        "Telegram Cloud (تخزين غير محدود عبر بوت تليجرام سحابي)",
        "Yandex Disk & Koofr",
        "تشفير محلي إضافي قبل وصول الملف للسحابة"
    ], border_color=C_PURPLE, icon="🔒", badge="End-to-End Encrypted")

    add_card(slide, 8.8, 1.8, 3.7, 3.4, "البروتوكولات المفتوحة وسحابات S3", [
        "WebDAV: Nextcloud, ownCloud, Synology NAS, QNAP",
        "S3 Compatible: Amazon AWS S3, Cloudflare R2",
        "MinIO (للخوادم المنزلية والشركات الخاصة)",
        "Wasabi & Backblaze B2 (أقل تكلفة تخزين)"
    ], border_color=C_AMBER, icon="🗄️", badge="Enterprise & NAS")

    banner = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(5.4), Inches(11.7), Inches(1.5))
    banner.fill.solid()
    banner.fill.fore_color.rgb = RGBColor(16, 26, 48)
    banner.line.color.rgb = C_EMERALD
    banner.line.width = Pt(1.5)
    tf_b = banner.text_frame
    tf_b.word_wrap = True
    p_b1 = tf_b.paragraphs[0]
    p_b1.text = "⚡ أداة النقل السحابي المباشر المدمجة (Cross-Cloud Direct Transfer Engine)"
    p_b1.font.name = FONT_HEADING
    p_b1.font.size = Pt(13.5)
    p_b1.font.bold = True
    p_b1.font.color.rgb = C_EMERALD
    p_b1.alignment = PP_ALIGN.RIGHT

    p_b2 = tf_b.add_paragraph()
    p_b2.text = "نقل عشرات الجيجابايت من سحابة إلى سحابة أخرى (مثلاً من Google Drive إلى OneDrive أو Mega) مباشرة في الذاكرة دون حفظ الملفات على القرص الصلب (Zero Local Disk Footprint)، مما يحافظ على عمر القرص SSD وسرعة جهازك."
    p_b2.font.name = FONT_BODY
    p_b2.font.size = Pt(10.5)
    p_b2.font.color.rgb = C_TEXT_WHITE
    p_b2.alignment = PP_ALIGN.RIGHT
    p_b2.space_before = Pt(4)

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 1:45 دقيقة]:\n"
        "• بدلاً من أن يقوم المستخدم بتثبيت 4 أو 5 برامج مزامنة مختلفة تستهلك ذاكرة الجهاز، جمعنا أكثر من 25 سحابة وبروتوكول قياسي في برنامج واحد.\n"
        "• ندعم السحابات التجارية الكبرى، السحابات المشفرة مثل Mega وتليجرام غير المحدود، وكذلك بروتوكولات الشركات المفتوحة S3 و WebDAV للخوادم الخاصة وأجهزة NAS.\n"
        "• ميزة النقل المباشر بين السحابات (Cross-Cloud Transfer): تستطيع نقل 50GB من جوجل درايف إلى ون درايف عبر تيار بيانات يمر في الرام فقط دون أن يلمس قرصك الصلب نهائياً."
    )

def build_slide_6(prs):
    # Slide 6: Dual Architecture (Desktop & Mobile)
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "معمارية برمجية مزدوجة ومستقلة: الحاسوب والهاتف", "CROSS-PLATFORM ENGINEERING", "هندسة برمجية بمعايير 25 عاماً: مساران مستقلان بالكامل في التطوير والبناء والإصدار")

    dash_shot = 'website/assets/shot-dashboard.png'
    add_image_card(slide, dash_shot, 0.8, 1.8, 4.3, 5.0, caption="AuraSync Desktop Native Dashboard (60 FPS)", border_color=C_BLUE)

    add_card(slide, 5.3, 1.8, 7.2, 2.4, "المسار الأول: نسخة الحاسوب المستقلة (Desktop Engine)", [
        "البيئة واللغات: Electron + Node.js 20+ مع واجهة React 18 و Vite فائقة السرعة.",
        "قاعدة بيانات محلية فائقة القوة: SQLite WASM مع معاملات الدفعات المجمعة (Batch Transactions).",
        "تكامل نظام ويندوز الأصلي: استدعاءات Win32 API وقشرة ويندوز عبر user32.dll وقوائم شل.",
        "استهلاك موارد متناهي الصغر: أقل من 65MB رام في الخمول، واستهلاك معالج < 1%."
    ], border_color=C_BLUE, icon="💻", badge="Windows x64 / Portable / Setup")

    add_card(slide, 5.3, 4.4, 7.2, 2.4, "المسار الثاني: نسخة الهاتف المستقلة (Android Native APK)", [
        "تطبيق أندرويد حقيقي: مبني بلغة Java الأصلية (MainActivity.java) مع جسر أصول داخلي فائق السرعة.",
        "أمان بيومتري حقيقي: دمج مستشعر البصمة الرسمي للنظام (BiometricPrompt) وليس مجرد محاكاة ويب.",
        "مستقبل المشاركة الجماعي: استقبال 900+ صورة وفيديو دفعة واحدة عبر Android Share Intent دون أي انهيار.",
        "حزم APK موقعة ومحدثة لأحدث أنظمة Android 14 و Android 15 (Target SDK 34)."
    ], border_color=C_EMERALD, icon="📱", badge="Android APK Native Engine")

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 1:45 دقيقة]:\n"
        "• المعمارية البرمجية للمشروع ليست تطبيقاً هجيناً بطيئاً، بل مساران مستقلان صُمما بأعلى معايير هندسة البرمجيات.\n"
        "• على الحاسوب: محرك Electron مع واجهة React 18، وقاعدة بيانات SQLite مجمعة، واستدعاءات Win32 أصيلة تضمن استهلاكاً أقل من 65MB رام.\n"
        "• على الهاتف: تطبيق أندرويد أصلي بلغة Java ومستشعر بصمة أصلي BiometricPrompt، يستقبل مئات الصور دفعة واحدة من معرض الهاتف ويرفعها مباشرة."
    )

def build_slide_7(prs):
    # Slide 7: Desktop Engine Deep Dive
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "الغوص الهندسي في محرك الحاسوب (Desktop Engine)", "SYSTEMS & BACKEND ARCHITECTURE", "حلول هندسية عميقة لمعالجة أقفال الملفات، وتسريع قواعد البيانات، واستقرار الذاكرة")

    add_card(slide, 0.8, 1.8, 5.7, 2.4, "المعالجة المجمعة وقواعد البيانات (Batch SQLite)", [
        "استبدال آلاف استعلامات القرص الفردية بمعاملات مجمعة عبر دالة upsertFilesBatch.",
        "تقليص زمن فحص ومزامنة 40,000 ملف من 3 دقائق كاملة إلى أقل من 4 ثوانٍ فقط!",
        "فهارس B-Tree محسنة لمسارات الملفات ومعرفات المجلدات لضمان زمن استعلام O(log N).",
        "كتابة وحفظ لاتزامني غير حاجب لواجهة المستخدم (Non-blocking async disk flushing)."
    ], border_color=C_CYAN, icon="⚡", badge="أداء فائق للبيانات")

    add_card(slide, 6.8, 1.8, 5.7, 2.4, "كاش المجلدات الذكي (Parent Folder Caching)", [
        "معضلة Google Drive: تكرار طلبات البحث عن المجلدات يؤدي لحظر الحساب برمز HTTP 429.",
        "ابتكار الكاش الداخلي: تخزين شجرة المجلدات بالذاكرة (parentFolderFilesCache).",
        "إلغاء آلاف طلبات files.list المكررة وضمان تدفق الرفع بسرعة خط الإنترنت القصوى.",
        "إنشاء تلقائي للمجلدات الفارغة والحفاظ على هيكل المجلدات مطابقاً للأصل 1:1."
    ], border_color=C_AMBER, icon="🧠", badge="تخطي قيود الـ API")

    add_card(slide, 0.8, 4.4, 5.7, 2.4, "تجاوز أقفال ملفات ويندوز (EBUSY / EPERM)", [
        "المعضلة: برامج مكافحة الفيروسات وويندوز تقفل الملفات التنفيذية أثناء التحديثات.",
        "الحل المعماري: نظام التفويض لقشرة ويندوز مع إعادة المحاولة المتكررة (Exponential Retry).",
        "تحديث ذكي بالدلتا: نسخ الملفات المتغيرة فقط app.asar وتخطي ملفات Chromium الكبيرة.",
        "إنهاء التحديث وإعادة تشغيل التطبيق في أقل من 800 ميلي ثانية بصمت تام."
    ], border_color=C_EMERALD, icon="🔧", badge="مناعة أعطال ويندوز")

    add_card(slide, 6.8, 4.4, 5.7, 2.4, "فلترة المخلفات ونقاء السحابة (Zero Junk Guarantee)", [
        "حجب دائم ونهائي لملفات النظام المخفية: desktop.ini, Thumbs.db, .DS_Store.",
        "تطهير فوري لقاعدة البيانات عند الإقلاع لمحو أي سجلات سابقة للملفات المخفية.",
        "المحو السحابي الصاعق (1-Second Cloud Wipe): مسح السحابة بالكامل عبر شلال الخوادم.",
        "تفريغ سلة المهملات تلقائياً لضمان عودة كوتا التخزين إلى 0GB بدقة."
    ], border_color=C_PURPLE, icon="🧹", badge="تخزين سحابي نقي 100%")

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 2:00 دقيقة]:\n"
        "• هذه الشريحة موجهة للمهندسين والمعماريين التقنيين:\n"
        "1. نقلنا سرعة فحص 40 ألف ملف من 3 دقائق إلى 4 ثوانٍ فقط بفضل استعلامات SQLite الدفعية المجمعة.\n"
        "2. تفادينا مشكلة حظر جوجل درايف الشهيرة (Rate Limit 429) بابتكار شجرة كاش المجلدات بالذاكرة.\n"
        "3. حللنا معضلة أقفال ملفات ويندوز EBUSY بالتحديث الصامت بالدلتا في 800 ميلي ثانية.\n"
        "4. فلترة صارمة لملفات النظام مثل desktop.ini لتبقى السحابة نظيفة 100%."
    )

def build_slide_8(prs):
    # Slide 8: Mobile Engine Deep Dive
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "هندسة نسخة الهاتف: نقل كامل المعرض بضغطة زر", "MOBILE ENGINE & GALLERY ARCHITECTURE", "حل مشكلة امتلاء ذاكرة الهاتف وتقديم تجربة مستخدم سريعة، مشفرة ومستقلة")

    add_card(slide, 0.8, 1.8, 5.7, 2.4, "مجلد الهاتف المخصص (aurasync-mobile)", [
        "عزل كامل لملفات الهاتف: إنشاء مجلد aurasync-mobile تلقائياً على كل السحابات.",
        "عدم خلط صور الهاتف بملفات الكمبيوتر أو مجلدات العمل لضمان الترتيب التام.",
        "التحقق الحقيقي من السحابة: فحص وجود المجلد السحابي والملفات قبل أي عملية تنزيل.",
        "ميزة إخلاء مساحة الهاتف الآمنة بعد التأكد التام من اكتمال الرفع السحابي."
    ], border_color=C_EMERALD, icon="📁", badge="تنظيم سحابي تلقائي")

    add_card(slide, 6.8, 1.8, 5.7, 2.4, "مشاركة 900+ ملف دفعة واحدة (Bulk Share Intent)", [
        "استقبال المشاركات الضخمة عبر MainActivity.java بنظام ACTION_SEND_MULTIPLE.",
        "تحديد مئات الصور والفيديوهات من معرض سامسونج أو شاومي ومشاركتها مباشرة مع AuraSync.",
        "محرك الرفع المتوازي مع شريط تقدم حي ومؤشر {done} / {total} دقيق بالثانية.",
        "استئناف تلقائي لعمليات الرفع عند انقطاع الإنترنت دون إعادة الملفات من البداية."
    ], border_color=C_CYAN, icon="📤", badge="سرعة استيعاب قصوى")

    add_card(slide, 0.8, 4.4, 5.7, 2.4, "الأمان البيومتري ولوحة PIN التفاعلية", [
        "مستشعر البصمة الحقيقي: استدعاء واجهة BiometricPrompt الرسمية لنظام أندرويد.",
        "لوحة أرقام PIN زجاجية (12-Key Glassmorphism) مع ردود فعل حركية عند الخطأ.",
        "جسر أمان لاتزامني: لا يتم فتح القفل إلا بعد صدور إشارة المصادقة الحقيقية من الهاتف.",
        "حماية الخزنة السحابية من أي متطفل حتى لو كان الهاتف مفتوحاً."
    ], border_color=C_PURPLE, icon="👆", badge="حماية بيومترية حقيقية")

    add_card(slide, 6.8, 4.4, 5.7, 2.4, "حارس البطارية وشبكة الواي فاي (Smart Sentinel)", [
        "المزامنة الذكية المشروطة: إمكانية تفعيل النسخ التلقائي عند الاتصال بشبكة Wi-Fi فقط.",
        "المزامنة أثناء الشحن فقط: للحفاظ على عمر البطارية ومنع استنزافها أثناء التنقل.",
        "فحص البصمة الرقمية (Hash Deduplication): منع إعادة رفع الصور المكررة نهائياً.",
        "توافق كامل مع Android 14 و Android 15 بحزم APK موقعة وخالية من الشاشات السوداء."
    ], border_color=C_AMBER, icon="🔋", badge="استهلاك ذكي للطاقة")

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 1:45 دقيقة]:\n"
        "• أزمة كل مستخدم هاتف ذكي هي امتلاء ذاكرة الهاتف وظهور رسالة 'مساحة التخزين غير كافية'.\n"
        "• يقدم AuraSync حلاً جذرياً: حدد المعرض بالكامل — 900 صورة أو 2000 صورة — وشاركها بنقرة واحدة مع التطبيق ليتم رفعها تلقائياً إلى مجلد aurasync-mobile الخاص في سحابتك المفضلة.\n"
        "• التطبيق مؤمن بالبصمة البيومترية الحقيقية مع خيارات ذكية للحفاظ على باقة البيانات والبطارية."
    )

def build_slide_9(prs):
    # Slide 9: Cybersecurity & Browser Guard Hub
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "الأمن السيبراني: تشفير الحاويات وحارس المتصفحات", "CYBERSECURITY & BROWSER GUARD", "ابتكار غير مسبوق يدمج بين التشفير العسكري وقفل تصفح الإنترنت الفوري لحماية الخصوصية")

    prot_shot = 'website/assets/shot-protection.png'
    add_image_card(slide, prot_shot, 0.8, 1.8, 4.3, 5.0, caption="AuraSync Browser Guard & PIN Security Hub", border_color=C_PURPLE)

    add_card(slide, 5.3, 1.8, 7.2, 2.4, "ابتكار حارس المتصفحات الفوري (Browser Guard Innovation)", [
        "مراقبة النواة بسرعة 35 ميلي ثانية عبر استدعاءات user32.dll لنوافذ المتصفحات النشطة.",
        "دعم كافة المتصفحات الشهيرة: Chrome, Microsoft Edge, Brave, Firefox, Opera, Arc.",
        "قفل فوري (0ms) بمجرد التبديل للمتصفح مع ظهور بطاقة زجاجية فاخرة لإدخال رمز PIN.",
        "حماية نظام ويندوز الصارمة: بعد محاولتين خاطئتين للرمز، يتم قفل الكمبيوتر بالكامل فوراً (Win + L)."
    ], border_color=C_PURPLE, icon="🛡️", badge="ابتكار أمني حصري")

    add_card(slide, 5.3, 4.4, 7.2, 2.4, "خزنة التشفير العسكري والجلسة المعزولة (Aura Vault)", [
        "تشفير الحاويات الكاملة بتقنية AES-256-GCM مع اشتقاق المفاتيح عبر PBKDF2 المنيع.",
        "تشفير مجلدات كاملة مع كافة تفرعاتها داخل حاوية مشفرة واحدة (.aura / AURADIR01).",
        "الجلسة المعزولة الآمنة: فك تشفير المجلد مؤقتاً في جلسة معزولة، وإعادة القفل التلقائي ومحو الملفات المكشوفة فور إغلاق نافذة المجلد.",
        "تكامل مباشر مع قائمة كليك يمين في ويندوز مع دعم رموز PIN السريعة المكونة من 4 أرقام."
    ], border_color=C_CYAN, icon="🔐", badge="AES-256 Authenticated")

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 2:00 دقيقة]:\n"
        "• هنا الابتكار الأمني الحصري الذي يخطف الأنظار في AuraSync:\n"
        "• تخيل أنك تركت حاسوبك في المكتب وذهب لإحضار كوب قهوة. أي شخص يقترب ويضغط على أيقونة Chrome أو Edge لقراءة محادثاتك أو بريدك... يُفاجأ بحارس المتصفح يطلب رمز PIN فوراً!\n"
        "• وإذا حاول التخمين مرتين بالخطأ، يقوم AuraSync بقفل نظام ويندوز بالكامل فوراً عبر Win+L لحماية أسرار حاسوبك بالكامل!\n"
        "• إضافة إلى التشفير العسكري AES-256 للمجلدات الحساسة بنظام الجلسة المعزولة."
    )

def build_slide_10(prs):
    # Slide 10: 1-Click Disaster Recovery & PC Migration
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "استعادة الجهاز وهجرة الحواسيب بنقرة واحدة (1-Click Recovery)", "DISASTER RECOVERY & PC MIGRATION", "إعادة بناء جهازك بالكامل بعد الفورمات أو الانتقال لحاسوب جديد بنفس الترتيب والمجلدات")

    mig_shot = 'website/assets/cloud-migration.jpg'
    add_image_card(slide, mig_shot, 0.8, 1.8, 4.3, 5.0, caption="1-Click PC Migration & Bare-Metal Restore", border_color=C_AMBER)

    add_card(slide, 5.3, 1.8, 7.2, 2.4, "معمارية بصمة الجهاز (aurasync-machine-manifest.json)", [
        "حفظ خريطة المجلدات السحابية: يتم تسجيل مسارات الحاسوب الأصلية في ملف مانيفست سحابي ذكي.",
        "التعرف التلقائي على مسارات ويندوز القياسية وإعادة ربطها فورياً على الجهاز الجديد:",
        "Desktop ➔ سطح المكتب الجديد  |  Documents ➔ المستندات  |  Pictures ➔ الصور.",
        "التعامل الذكي مع مسارات ون درايف الافتراضية وإعادة توجيهها دون حدوث تكرار للملفات."
    ], border_color=C_AMBER, icon="💾", badge="بصمة سحابية ذكية")

    add_card(slide, 5.3, 4.4, 7.2, 2.4, "محرك التنزيل المتزامن فائق السرعة (Parallel Restore)", [
        "حوض عمال متوازيين (Download Worker Pool) لتنزيل عشرات الملفات بالتزامن.",
        "مؤشرات سرعة وإنجاز حية: عداد رقمي دقيق للسرعة بالثانية ونسبة مئوية للإتمام.",
        "التخطي الذكي للملفات المتطابقة: عدم إهدار الإنترنت في تنزيل ملفات موجودة بالفعل.",
        "إعادة تفعيل المراقبة وتلوين المجلدات تلقائياً بمجرد اكتمال عملية الاستعادة."
    ], border_color=C_CYAN, icon="⚡", badge="استرجاع فوري متكامل")

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 1:30 دقيقة]:\n"
        "• كابوس كل مستخدم هو فورمات الحاسوب أو شراء جهاز جديد: ساعات طويلة في تنزيل الملفات وترتيب سطح المكتب والمستندات.\n"
        "• مع AuraSync: تثبت البرنامج على جهازك الجديد، وتضغط 'استعادة بنقرة واحدة'. يقرأ البرنامج ملف المانيفست السحابي aurasync-machine-manifest.json، ويعيد بناء سطح المكتب والمجلدات بنفس الهيكل والترتيب فوراً وبأقصى سرعة تنزيل ممكنة."
    )

def build_slide_11(prs):
    # Slide 11: Turbo Concurrency & Gigabit Performance
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "محرك السرعة الفائقة واستغلال شبكات الفايبر (Turbo Concurrency)", "HIGH-THROUGHPUT NETWORKING", "أقصى استغلال لسرعة الإنترنت وسحق زمن الانتظار عبر المعالجة المتزامنة المتعددة")

    add_card(slide, 0.8, 1.8, 5.7, 2.4, "أنماط السرعة الأربعة (Speed & Concurrency Profiles)", [
        "نمط الهدوء (Quiet — 2 Workers): استهلاك صفري للموارد، مثالي للألعاب ومكالمات الفيديو.",
        "النمط المتوازن الموصى به (Balanced — 4 Workers): أفضل توازن بين السرعة والانسيابية.",
        "نمط التوربو (Turbo — 8 to 16 Workers): مضاعفة سرعة الرفع لشبكات الألياف العادية.",
        "ألترا توربو لسرعات الفايبر (Ultra Turbo — 24 to 32 Workers): استغلال خطوط 1000 Mbps بالكامل."
    ], border_color=C_AMBER, icon="🎛️", badge="تخصيص كامل للأداء")

    add_card(slide, 6.8, 1.8, 5.7, 2.4, "تخطي زمن استجابة السحابة (Overcoming HTTP Latency)", [
        "معضلة السحابة: استجابة خوادم جوجل ومايكروسوفت تستغرق 200-400ms لكل ملف فردي.",
        "الحل: الرفع المتوازي لـ 32 ملفاً في نفس اللحظة يجعل سرعة الرفع مشبعة لخط الإنترنت تماماً.",
        "رفع آلاف الصور والمستندات في دقائق معدودة بدلاً من الانتظار لساعات طويلة.",
        "إعادة المحاولة الذكية المتدرجة (Exponential Backoff) عند حدوث أي تقلب بالشبكة."
    ], border_color=C_CYAN, icon="🌐", badge="تشبع النطاق الترددي")

    add_stat_box(slide, 0.8, 4.4, 2.7, 2.3, "4 ثوانٍ", "فحص 40,000 ملف", "بدلاً من 3 دقائق سابقاً", C_CYAN)
    add_stat_box(slide, 3.8, 4.4, 2.7, 2.3, "< 65 MB", "استهلاك الذاكرة (RAM)", "خفة فائقة في وضع الخمول", C_EMERALD)
    add_stat_box(slide, 6.8, 4.4, 2.7, 2.3, "1 ثانية", "تصفير السحابة بالكامل", "عبر خوارزمية Cascade Deletion", C_AMBER)
    add_stat_box(slide, 9.8, 4.4, 2.7, 2.3, "60 FPS", "سلاسة تصفح الملفات", "عرض افتراضي Windowed Chunking", C_PURPLE)

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 1:45 دقيقة]:\n"
        "• الكثير من المستخدمين لديهم خطوط ألياف ضوئية فائقة السرعة (Gigabit Fiber)، لكن عند رفع الملفات إلى Google Drive يجدون السرعة بطيئة جداً بسبب زمن الـ HTTP Latency لكل ملف.\n"
        "• ابتكرنا محرك التوربو المتوازي (حتى 32 عاملاً): يرفع 32 ملفاً بالتزامن في نفس الجزء من الثانية، مشبعاً خط الفايبر بالكامل وموفراً ساعات من الانتظار.\n"
        "• مع الحفاظ على استهلاك خفيف جداً للذاكرة أقل من 65MB رام."
    )

def build_slide_12(prs):
    # Slide 12: Design System & UX Elegance
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "فلسفة التصميم: نظام Calm وثلاثة ثيمات فاخرة", "DESIGN SYSTEM & LUXURY AESTHETICS", "تصميم عصري فائق النقاء يدمج بين الفخامة والراحة البصرية وسلاسة التصفح 60FPS")

    files_shot = 'website/assets/shot-files.png'
    add_image_card(slide, files_shot, 0.8, 1.8, 4.3, 5.0, caption="Windowed 60 FPS File Explorer & Category View", border_color=C_CYAN)

    add_card(slide, 5.3, 1.8, 7.2, 2.4, "نظام التصميم الهادئ (The Calm Visual Design System)", [
        "انحناءات ناعمة مدروسة بدقة 20px تعطي شعوراً بالحداثة والاستقرار النفسي.",
        "توهج محيطي خافت (Subtle Ambient Glow) يبرز العناصر المهمة دون إجهاد العين.",
        "أزرار تفاعلية لمسية مع استجابة ميكروية سلسة عند النقر والتحويم (Hover & Active States).",
        "كبسولات إحصائية مضغوطة توفر نظرة سريعة على حالة المزامنة وسعة التخزين الحقيقية."
    ], border_color=C_CYAN, icon="🎨", badge="جماليات متقدمة")

    add_card(slide, 5.3, 4.4, 7.2, 2.4, "الثيمات الثلاثة الفاخرة وسلاسة العرض (60 FPS)", [
        "الأسود الفاحم النقي (Pure Pitch Black): خلفيات #000000 مع أزرق ملكي كلاسيكي وتصميم إنساني أصيل بدون توهج صناعي مزعج.",
        "الأزرق الكحلي الملكي (Midnight Sapphire): زرقة عميقة غنية ومبهرة لبيئات العمل الاحترافية.",
        "الأبيض اللؤلؤي العصري (Pristine White): نقاء ووضوح استثنائي للمكاتب المضيئة.",
        "تصفح افتراضي خفيف (Windowed Browsing): سلاسة مطلقة عند استعراض آلاف الملفات مثل جوجل درايف."
    ], border_color=C_PURPLE, icon="✨", badge="ثيمات أصلية متباينة")

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 1:30 دقيقة]:\n"
        "• البرمجيات العظيمة لا تكتفي بكونها قوية هندسياً، بل يجب أن تأسر عين المستخدم.\n"
        "• بنينا نظام التصميم Calm Design: ثلاث ثيمات حقيقية فاخرة:\n"
        "1. الأسود الفاحم Pure Pitch Black للمحترفين وشاشات OLED.\n"
        "2. الكحلي الملكي Midnight Sapphire.\n"
        "3. الأبيض اللؤلؤي Pristine White.\n"
        "• الواجهة تعمل بمعدل 60 إطاراً في الثانية حتى لو كنت تستعرض 50 ألف ملف بفضل نظام التقطيع الافتراضي Windowed Chunking."
    )

def build_slide_13(prs):
    # Slide 13: Enterprise ROI & Financial Savings
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "دراسة الجدوى وتوفير التكاليف (Enterprise ROI & Cloud Savings)", "FINANCIAL IMPACT & BUSINESS VALUE", "كيف يوفر AuraSync آلاف الدولارات سنوياً للمستخدمين والشركات مع حماية أصول البيانات")

    add_card(slide, 0.8, 1.8, 5.7, 2.4, "توحيد السعات المجانية وتفادي الاشتراكات المتكررة", [
        "دمج السعات المجانية: 15GB جوجل + 5GB ون درايف + 20GB ميجا + تيليجرام غير المحدود.",
        "يحصل المستخدم العادي على سعة سحابية هائلة مدمجة مجاناً 100% دون الحاجة لدفع أي اشتراك شهري.",
        "توفير ما بين 24$ إلى 120$ سنوياً لكل فرد كان يدفعها في اشتراكات Google One أو Dropbox.",
        "إدارة كافة الحسابات من نافذة موحدة دون التنقل بين المتصفحات والتطبيقات."
    ], border_color=C_EMERALD, icon="💰", badge="توفير فوري للأفراد")

    add_card(slide, 6.8, 1.8, 5.7, 2.4, "خفض تكاليف الشركات بنسبة تتجاوز 80%", [
        "استبدال اشتراكات Dropbox Business الباهظة (24$ لكل مستخدم شهرياً) بحلول S3 و Wasabi و Backblaze B2 (فقط 6$ لكل تيرابايت!).",
        "توفير أكثر من 70% إلى 80% من فواتير التخزين السحابي السنوية للمؤسسات والشركات الناشئة.",
        "انعدام تكاليف الخوادم الوسيطة (Zero Server Overhead): الاتصال يتم مباشرة من أجهزة الموظفين للسحابة.",
        "أمان عسكري محلي يغني عن شراء برمجيات تشفير منفصلة باهظة الثمن."
    ], border_color=C_CYAN, icon="🏢", badge="عائد استثماري ضخم للشركات")

    add_stat_box(slide, 0.8, 4.4, 3.7, 2.3, "80%+", "وفر سنوي في تكاليف السحابة", "باستخدام بروتوكولات S3 و Wasabi المفتوحة", C_EMERALD)
    add_stat_box(slide, 4.8, 4.4, 3.7, 2.3, "0 $", "تكاليف خوادم وسيطة", "اتصال مشفر مباشر من جهازك للسحابة", C_CYAN)
    add_stat_box(slide, 8.8, 4.4, 3.7, 2.3, "100%", "حماية ضد خسائر توقف الأعمال", "استرجاع فوري للأجهزة وحصانة ضد الفدية", C_AMBER)

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 1:45 دقيقة]:\n"
        "• لغة الأرقام والجدوى المالية:\n"
        "• للمستخدم العادي: نجمع له سعات حساباته المجانية في سحابة واحدة عملاقة دون أن يدفع سنتاً واحداً لاشتراكات شهرية متكررة.\n"
        "• للشركات والمؤسسات: بدلاً من دفع 24 دولاراً شهرياً لكل موظف في Dropbox، يمكنهم استخدام Wasabi أو Backblaze B2 عبر AuraSync بـ 6 دولارات فقط للتيرابايت كاملة، مما يوفر أكثر من 80% من فاتورة التخزين السنوية.\n"
        "• إضافة إلى تجنب خسائر برمجيات الفدية وتوقف الأعمال التي تكلف الشركات ملايين الدولارات."
    )

def build_slide_14(prs):
    # Slide 14: Real-World Use Cases & Personas
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "سيناريوهات الاستخدام الميدانية (Target Personas & Use Cases)", "REAL-WORLD APPLICATIONS", "حلول مخصصة تلبي متطلبات المحترفين، المبرمجين، الشركات، والعائلات")

    add_card(slide, 0.8, 1.8, 5.7, 2.4, "1. المصورون وصناع المحتوى (Creators & Photographers)", [
        "رفع آلاف الصور بصيغ RAW وفيديوهات 4K الضخمة عبر محرك التوربو بسرعة خط الفايبر الكاملة.",
        "نقل مكتبة الصور السحابية من سحابة إلى سحابة أخرى دون تحميلها على القرص الصلب.",
        "سياسة انعدام الحذف تضمن عدم ضياع جلسات التصوير الحساسة أثناء فرز الملفات المحلية."
    ], border_color=C_CYAN, icon="📸", badge="صناع المحتوى")

    add_card(slide, 6.8, 1.8, 5.7, 2.4, "2. المبرمجون والمهندسون (Developers & Engineers)", [
        "استثناء ذكي للملفات المؤقتة ومجلدات الحزم node_modules و .git لتوفير السعة السحابية.",
        "نسخ احتياطي فوري لمشاريع الأكواد والبيانات دون تباطؤ الحاسوب أو تعطيل البرمجة.",
        "استعادة بيئة العمل ومجلدات البرمجة بالكامل على أي جهاز جديد بضغطة زر واحدة."
    ], border_color=C_EMERALD, icon="💻", badge="المهندسون والتقنيون")

    add_card(slide, 0.8, 4.4, 5.7, 2.4, "3. الشركات وبيئات العمل المشتركة (Enterprises & Offices)", [
        "حارس المتصفحات Win+L يحمي حسابات العمل الحساسة والبريد والواتساب من تطفل الزملاء والزوار.",
        "ربط أجهزة التخزين الشبكي للشركات (Synology / QNAP NAS) عبر بروتوكول WebDAV الموحد.",
        "تشفير العقود والمستندات السرية بتقنية AES-256 قبل رفعها للسحابة لحماية الأسرار المؤسسية."
    ], border_color=C_PURPLE, icon="🏢", badge="الشركات والمؤسسات")

    add_card(slide, 6.8, 4.4, 5.7, 2.4, "4. العائلات والمستخدمون اليوميون (Everyday Families)", [
        "نقل مئات صور وفيديوهات المعرض من الهاتف إلى السحابة بضغطة زر لإخلاء ذاكرة الهاتف فوراً.",
        "أمان بيومتري وبصمة إصبع لحماية الصور العائلية في مجلد aurasync-mobile المنعزل.",
        "راحة بال مطلقة بعدم ضياع ذكريات العائلة حتى لو تلف الهاتف أو تعطل الحاسوب."
    ], border_color=C_AMBER, icon="👨‍👩‍👧‍👦", badge="الاستخدام المنزلي")

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 1:45 دقيقة]:\n"
        "• المنصة لا تخدم فئة واحدة فقط، بل تم تصميمها لتغطي 4 سيناريوهات حيوية:\n"
        "1. المصور وصانع المحتوى الذي يرفع آلاف ملفات RAW في دقائق عبر التوربو.\n"
        "2. المبرمج الذي يريد حماية أكواده واستعادة بيئته بعد الفورمات.\n"
        "3. المكاتب والشركات التي تحتاج قفل المتصفحات وحماية أسرارها.\n"
        "4. العائلات التي تريد إفراغ ذاكرة الهاتف وحفظ الذكريات بأمان دون تعقيد."
    )

def build_slide_15(prs):
    # Slide 15: Head-to-Head Competitive Matrix
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "المقارنة الحاسمة: كيف يتفوق AuraSync على عمالقة السحاب؟", "HEAD-TO-HEAD COMPETITIVE MATRIX", "مقارنة تفصيلية مباشرة توضح الفوارق الجوهرية والامتيازات الحصرية لمنصة AuraSync")

    rows, cols = 8, 6
    tbl_shape = slide.shapes.add_table(rows, cols, Inches(0.8), Inches(1.8), Inches(11.733), Inches(5.0))
    tbl = tbl_shape.table

    tbl.columns[0].width = Inches(3.3)
    tbl.columns[1].width = Inches(2.1)
    tbl.columns[2].width = Inches(1.6)
    tbl.columns[3].width = Inches(1.6)
    tbl.columns[4].width = Inches(1.5)
    tbl.columns[5].width = Inches(1.6)

    headers = ["الميزة والخاصية الهندسية", "AuraSync ☁️", "Google Drive", "OneDrive", "Dropbox", "Mega.nz"]
    for c_idx, text in enumerate(headers):
        cell = tbl.cell(0, c_idx)
        cell.fill.solid()
        cell.fill.fore_color.rgb = RGBColor(16, 28, 56) if c_idx == 1 else RGBColor(12, 18, 32)
        p = cell.text_frame.paragraphs[0]
        p.text = text
        p.font.name = FONT_HEADING
        p.font.size = Pt(11)
        p.font.bold = True
        p.font.color.rgb = C_CYAN if c_idx == 1 else C_TEXT_WHITE
        p.alignment = PP_ALIGN.CENTER

    data = [
        ("سياسة عدم الحذف عند المسح المحلي (Zero-Deletion)", "✅ نعم 100% تلقائي", "❌ يحذف فوراً", "❌ يحذف فوراً", "❌ يحذف فوراً", "❌ يحذف فوراً"),
        ("دمج أكثر من 25 سحابة وبروتوكول بواجهة واحدة", "✅ نعم مدمج موحد", "❌ سحابتهم فقط", "❌ سحابتهم فقط", "❌ سحابتهم فقط", "❌ سحابتهم فقط"),
        ("النقل المباشر بين السحابات (Cloud-to-Cloud)", "✅ نعم (Zero Disk)", "❌ غير مدعوم", "❌ غير مدعوم", "❌ غير مدعوم", "❌ غير مدعوم"),
        ("قفل المتصفحات برمز PIN وحماية قفل ويندوز Win+L", "✅ نعم حصرياً", "❌ غير متوفر", "❌ غير متوفر", "❌ غير متوفر", "❌ غير متوفر"),
        ("استعادة الجهاز بالكامل بعد الفورمات بنقرة واحدة", "✅ نعم (Manifest)", "❌ تنزيل يدوي", "❌ تنزيل يدوي", "❌ تنزيل يدوي", "❌ تنزيل يدوي"),
        ("تشفير الحاويات العسكري AES-256 محلياً قبل الرفع", "✅ نعم مدمج مجاناً", "❌ لا يوجد تشفير محلي", "❌ قبو محدود 3 ملفات", "❌ غير متاح", "✅ تشفير خاص"),
        ("استهلاك الذاكرة في الخلفية وضع الخمول", "⚡ خفيف (< 65MB)", "⚠️ ثقيل (250MB+)", "⚠️ ثقيل (200MB+)", "⚠️ ثقيل (300MB+)", "⚠️ متوسط (150MB+)")
    ]

    for r_idx, row in enumerate(data, start=1):
        for c_idx, val in enumerate(row):
            cell = tbl.cell(r_idx, c_idx)
            cell.fill.solid()
            if c_idx == 1:
                cell.fill.fore_color.rgb = RGBColor(18, 32, 60)
            else:
                cell.fill.fore_color.rgb = RGBColor(14, 20, 36) if r_idx % 2 == 0 else RGBColor(10, 15, 28)
            
            p = cell.text_frame.paragraphs[0]
            p.text = val
            p.font.name = FONT_BODY
            p.font.size = Pt(10)
            if c_idx == 1:
                p.font.bold = True
                p.font.color.rgb = C_EMERALD if "✅" in val or "⚡" in val else C_CYAN
            else:
                p.font.color.rgb = C_TEXT_MUTED if "❌" in val or "⚠️" in val else C_TEXT_WHITE
            p.alignment = PP_ALIGN.RIGHT if c_idx == 0 else PP_ALIGN.CENTER

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 2:00 دقيقة]:\n"
        "• انظروا إلى هذا الجدول المقارن: العمود الثاني الأخضر يمثل AuraSync، وباقي الأعمدة تمثل عمالقة السحابة العالمية.\n"
        "• في كل خاصية حاسمة — سياسة انعدام الحذف، دمج 25 سحابة، النقل المباشر بدون قرص، حارس المتصفحات، استعادة الجهاز بمانيفست سحابي، والخفة الفائقة — يتفوق AuraSync بشكل مطلق.\n"
        "• الشركات الكبرى تبني قلاعاً مغلقة لتحبسك داخل خدماتها، بينما نحن بنينا جسراً يوحد كل خدماتك السحابية ويحميها."
    )

def build_slide_16(prs):
    # Slide 16: DevOps, CI/CD & Automated QA Pipelines
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "هندسة الجودة، الـ CI/CD، ومسارات الإصدار المستقلة", "DEVOPS & ENTERPRISE QUALITY ASSURANCE", "بنية برمجية صارمة تضمن استقرار التحديثات بنسبة خطأ 0% واختبارات مؤتمتة شاملة")

    add_card(slide, 0.8, 1.8, 5.7, 2.4, "مسارات الإصدار المستقلة (Independent Dual Pipelines)", [
        "قاعدة هندسية صارمة: تعديلات الهاتف لا تبني الحاسوب، وتعديلات الحاسوب لا تبني حزم الأندرويد.",
        "مسار الهاتف (Track A): تحديث إصدار الهاتف، فحص الجودة، بناء وتوقيع AuraSync.apk، ورفعه تلقائياً لجيت هب.",
        "مسار الحاسوب (Track B): فحص 100% للاختبارات، بناء Setup.exe و Portable.exe، والنشر التلقائي للريليز.",
        "توفير هائل في استهلاك المعالج وتوفير مساحة التخزين وسرعة التسليم في ثوانٍ."
    ], border_color=C_CYAN, icon="🚀", badge="Continuous Delivery")

    add_card(slide, 6.8, 1.8, 5.7, 2.4, "جناح الاختبارات المؤتمت الشامل (382+ Tests)", [
        "تنفيذ مئات الاختبارات الآلية (npm test & npm run check) قبل كل عملية نشر.",
        "فحص شامل لتكامل قواعد البيانات، مفاتيح التشفير، ومحركات Google Drive و OneDrive و Dropbox.",
        "التدقيق الثلاثي قبل التنفيذ (Triple Code Review): فحص الحالات الشاذة، تنظيف الموارد، ومناعة الانتكاس.",
        "تحقيق نسبة نجاح 100% دائماً وخلو تام من أي تحذيرات لينت أو تسريب ذاكرة."
    ], border_color=C_EMERALD, icon="✅", badge="100% Test Pass Rate")

    add_card(slide, 0.8, 4.4, 5.7, 2.4, "المُحدّث التلقائي الصامت بنقرة واحدة (Auto-Updater)", [
        "فحص ذكي كل 3 دقائق وعند استعادة نافذة التطبيق لأي إصدار جديد على GitHub.",
        "تجاوز قيود الـ API (Zero-Rate-Limit): دعم التحويل 302 وسيرفرات CDN السريعة.",
        "تحديث ذكي فوري بالدلتا: تنزيل وتطبيق التحديث وإعادة تشغيل التطبيق في أقل من ثانية واحدة.",
        "شارة تنبيه ذهبية هادئة وحصرية في شريط الإعدادات لتفادي تشتيت المستخدم أثناء العمل."
    ], border_color=C_AMBER, icon="🔄", badge="1-Click Silent Update")

    add_card(slide, 6.8, 4.4, 5.7, 2.4, "أرشفة الإصدارات الدائمة والتحكم بالنسخ", [
        f"نظام أرشفة دائم يحفظ كل مثبت تنفيذي مستقل (v1.7.68 ... v{DESKTOP_VER}) بأمان.",
        "حفظ مساحة القرص المحلي بحذف الملفات المؤقتة ورفع النسخ الموثقة إلى GitHub Releases.",
        "إمكانية الرجوع لأي إصدار سابق بضغطة زر عند الحاجة لبيئات العمل المؤسسية القديمة.",
        "حماية الملفات التجميعية من أخطاء المشاركة عبر إدارة حصرية لعمليات الإغلاق."
    ], border_color=C_PURPLE, icon="📦", badge="Artifacts Management")

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 1:30 دقيقة]:\n"
        "• من وراء الكواليس: كيف نضمن استقرار المشروع؟\n"
        "• لدينا مساران مؤتمتان بالكامل للـ CI/CD: تعديلات الهاتف لا تبني الحاسوب والعكس، مما يوفر الوقت والموارد.\n"
        "• 382 فحصاً مؤتمتاً ينفذ بنسبة نجاح 100% قبل كل إصدار رسمي، مع ميزة التحديث الصامت بنقرة واحدة في أقل من ثانية عبر الدلتا."
    )

def build_slide_17(prs):
    # Slide 17: Strategic Roadmap & Future Expansion
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "المستقبل يبدأ الآن: خارطة طريق التوسع والتطوير", "FUTURE STRATEGIC ROADMAP", "رؤية طموحة لنقل المنصة إلى آفاق التخزين اللامركزي، الذكاء الاصطناعي، ومزامنة الند-للند")

    add_card(slide, 0.8, 1.8, 5.7, 2.4, "1. المزامنة المباشرة الند-للند (P2P Local LAN Sync)", [
        "مزامنة ونقل الملفات الضخمة بين أجهزة الكمبيوتر والهواتف على نفس شبكة الواي فاي المحلية.",
        "سرعة نقل خارقة تتجاوز 100 ميجابايت/ثانية دون أن تمر الملفات عبر الإنترنت نهائياً.",
        "حماية قصوى للبيانات الحساسة وتوفير كامل لباقة الإنترنت المنزلية والمكتبية."
    ], border_color=C_CYAN, icon="📡", badge="المرحلة القادمة Q3")

    add_card(slide, 6.8, 1.8, 5.7, 2.4, "2. تطبيق الآيفون الأصلي (Native iOS Edition)", [
        "تطوير نسخة متوافقة بالكامل مع نظام iOS ومتاحة على متجر Apple App Store.",
        "ربط مباشر مع مكتبة صور آبل (Apple Photos iCloud) ومحرك مشاركة iOS Share Sheet.",
        "تكامل مع بصمة الوجه (Face ID) لتأمين الخزنة السحابية على أجهزة iPhone و iPad."
    ], border_color=C_BLUE, icon="🍏", badge="توسع متعدد المنصات")

    add_card(slide, 0.8, 4.4, 5.7, 2.4, "3. الذكاء الاصطناعي لتنظيم الصور (AI Smart Gallery)", [
        "خوارزميات ذكاء اصطناعي محلية (Local On-Device AI) للتعرف على محتوى الصور وفرزها تلقائياً.",
        "البحث الذكي بالكلمات الدلالية: كتابة 'سيارة' أو 'مستند عقد' للعثور على الصورة فوراً.",
        "الكشف الذكي التلقائي عن الصور المتطابقة والمشوشة واقتراح مسحها لتوفير المساحة."
    ], border_color=C_PURPLE, icon="🤖", badge="ذكاء محلي فائق الخصوصية")

    add_card(slide, 6.8, 4.4, 5.7, 2.4, "4. التخزين اللامركزي والويب 3 (Web3 Decentralized)", [
        "ربط شبكات التخزين اللامركزية العالمية (IPFS, Arweave, Filecoin) كخيارات تخزين إضافية.",
        "حفظ البيانات المشفرة للأبد دون الاعتماد على خوادم أي شركة تجارية قد تقفل حسابك.",
        "سيادة رقمية كاملة للمستخدم على بياناته وأسراره الرقمية."
    ], border_color=C_EMERALD, icon="🌐", badge="أمان رقمي أبدي")

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 1:30 دقيقة]:\n"
        "• أين تتجه المنصة مستقبلاً؟\n"
        "1. المزامنة المباشرة الند-للند P2P LAN لنقل الملفات بين أجهزتك المنزلية بسرعة 100MB/s دون استهلاك باقة الإنترنت.\n"
        "2. نسخة الـ iOS الأصلية مع دعم Face ID ومشاركة الآيفون.\n"
        "3. ذكاء اصطناعي محلي يعمل على جهازك دون إرسال بياناتك لخوادم خارجية، لفرز الصور والبحث بالمعنى.\n"
        "4. ربط شبكات التخزين اللامركزي Web3 لضمان بقاء البيانات للأبد."
    )

def build_slide_18(prs):
    # Slide 18: Executive Summary & Project Assets
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(slide)
    add_header(slide, "AuraSync — الأمان المطلق لبياناتك الرقمية اليوم ومستقبلاً", "PROJECT SUMMARY & DELIVERABLES", "مشروع متكامل، ناضج، ومتاح للإنتاج والاستخدام التجاري والمؤسسي الفوري")

    settings_shot = 'website/assets/shot-settings.png'
    add_image_card(slide, settings_shot, 0.8, 1.8, 4.3, 5.0, caption="AuraSync Unified Settings & Cloud Manager", border_color=C_EMERALD)

    add_card(slide, 5.3, 1.8, 7.2, 2.4, "الخلاصة التنفيذية للمشروع (Executive Value Summary)", [
        "حل شامل وجاهز للإنتاج التجاري (Commercial Production-Grade) بمعايير معمارية عالمية.",
        "أول منصة في العالم تجمع بين سياسة انعدام الحذف، دمج 25 سحابة، وحارس المتصفحات Win+L.",
        f"نسخة هاتف مستقلة (APK v{MOBILE_VER}) بمستشعر بصمة حقيقي ومشاركة 900+ صورة بضغطة زر واحدة.",
        f"نسخة كمبيوتر مستقلة (Desktop v{DESKTOP_VER}) مختبرة بنسبة 100% عبر 382+ فحص تكاملي لضمان الصفر أخطاء."
    ], border_color=C_EMERALD, icon="🏆", badge="جاهز للاستخدام التجاري")

    links = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(5.3), Inches(4.4), Inches(7.2), Inches(2.4))
    links.fill.solid()
    links.fill.fore_color.rgb = RGBColor(16, 26, 48)
    links.line.color.rgb = C_CYAN
    links.line.width = Pt(1.5)

    tf_l = links.text_frame
    tf_l.word_wrap = True
    tf_l.margin_left = Inches(0.25)
    tf_l.margin_right = Inches(0.25)
    tf_l.margin_top = Inches(0.18)

    p_l1 = tf_l.paragraphs[0]
    p_l1.text = "🔗 مصادر المشروع والمخرجات الجاهزة للتشغيل (Deliverables)"
    p_l1.font.name = FONT_HEADING
    p_l1.font.size = Pt(13)
    p_l1.font.bold = True
    p_l1.font.color.rgb = C_CYAN
    p_l1.alignment = PP_ALIGN.RIGHT

    items_l = [
        f"نسخة الكمبيوتر الرسمية: AuraSync-Setup-v{DESKTOP_VER}.exe و AuraSync-Portable.exe (على GitHub Releases)",
        f"نسخة الهاتف الرسمية: AuraSync.apk و AuraSync-v{MOBILE_VER}.apk (جاهزة للتثبيت الفوري على Android)",
        "الموقع الرسمي الفاخر: website/index.html (يدعم اللغتين العربية والإنجليزية بتصاميم 3D)",
        "المستودع البرمجي الرسمي: samer20032020-dev/aurasync على منصة GitHub",
        "العرض التقديمي الأصلي: ملف PowerPoint الاحترافي AuraSync-Full-Project-Presentation.pptx",
        "العرض التفاعلي الحي: منصة العرض السينمائي AuraSync-Interactive-Presentation.html"
    ]
    for itm in items_l:
        p = tf_l.add_paragraph()
        p.text = f"• {itm}"
        p.font.name = FONT_BODY
        p.font.size = Pt(9.5)
        p.font.color.rgb = C_TEXT_WHITE
        p.alignment = PP_ALIGN.RIGHT
        p.space_before = Pt(3)

    add_speaker_notes(slide, 
        "ملاحظات المتحدث [المدة: 1:30 دقيقة]:\n"
        "• ختاماً: AuraSync ليس مجرد فكرة أو نموذج أولي، بل منتج ناضج بالكامل متاح للاستخدام الفوري على أجهزة ويندوز وهواتف أندرويد.\n"
        "• يمثل قمة الأمان السيبراني وسهولة الاستخدام ويوفر استقلالية رقمية حقيقية للمستخدمين.\n"
        "• نشكركم جميعاً على حسن استماعكم، ويسعدنا الآن فتح باب الأسئلة والمناقشة."
    )

# -------------------------------------------------------------
# Main Execution
# -------------------------------------------------------------
def main():
    print(f"Initializing PowerPoint presentation generation (Desktop v{DESKTOP_VER} | Mobile v{MOBILE_VER})...")
    prs = create_base_presentation()

    builders = [
        ("Slide 1: Cover Slide", build_slide_1),
        ("Slide 2: Market Problem & Critical Gap", build_slide_2),
        ("Slide 3: The AuraSync Strategic Solution", build_slide_3),
        ("Slide 4: Zero-Deletion Policy Architecture", build_slide_4),
        ("Slide 5: Universal Cloud Ecosystem", build_slide_5),
        ("Slide 6: Dual Architecture (Desktop & Mobile)", build_slide_6),
        ("Slide 7: Desktop Engine Deep Dive", build_slide_7),
        ("Slide 8: Mobile Engine Deep Dive", build_slide_8),
        ("Slide 9: Cybersecurity & Browser Guard", build_slide_9),
        ("Slide 10: 1-Click Disaster Recovery", build_slide_10),
        ("Slide 11: Turbo Concurrency & Gigabit Performance", build_slide_11),
        ("Slide 12: Design System & UX Aesthetics", build_slide_12),
        ("Slide 13: Enterprise ROI & Financial Savings", build_slide_13),
        ("Slide 14: Real-World Use Cases & Personas", build_slide_14),
        ("Slide 15: Head-to-Head Competitive Matrix", build_slide_15),
        ("Slide 16: DevOps & Quality Assurance", build_slide_16),
        ("Slide 17: Strategic Roadmap & Future Expansion", build_slide_17),
        ("Slide 18: Project Summary & Assets", build_slide_18),
    ]

    for title, builder in builders:
        print(f"Building {title}...")
        builder(prs)

    output_filename = "AuraSync-Full-Project-Presentation.pptx"
    prs.save(output_filename)
    print(f"\n[SUCCESS] Full 18-slide master presentation created successfully at: {output_filename}")

if __name__ == "__main__":
    main()
