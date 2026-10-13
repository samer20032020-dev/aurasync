import React, { useState } from 'react';
import { BarChart3, GitBranch, Archive } from 'lucide-react';
import { useI18n } from '../i18n';
import StatsPage from './StatsPage';
import SnapshotsPage from './SnapshotsPage';
import PreservedBinPage from './PreservedBinPage';

export default function ProtectionPage({
  initialTab = 'stats',
  stats,
  folders = [],
  providers = [],
  showToast
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState(initialTab);

  const tabs = [
    { id: 'stats', label: t('tabs.stats'), icon: BarChart3 },
    { id: 'snapshots', label: t('tabs.snapshots'), icon: GitBranch },
    { id: 'archive', label: t('tabs.archive'), icon: Archive }
  ];

  return (
    <div className="fade-in max-w-5xl pb-12">
      <div className="page-tabs mb-4">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={tab === id ? 'on' : ''}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'stats' && <StatsPage stats={stats} />}
      {tab === 'snapshots' && (
        <SnapshotsPage folders={folders} providers={providers} showToast={showToast} />
      )}
      {tab === 'archive' && <PreservedBinPage showToast={showToast} />}
    </div>
  );
}
