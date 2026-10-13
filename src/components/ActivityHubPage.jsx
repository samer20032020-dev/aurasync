import React, { useState } from 'react';
import { History, ArrowLeftRight } from 'lucide-react';
import { useI18n } from '../i18n';
import ActivityPage from './ActivityPage';
import TransfersPage from './TransfersPage';

export default function ActivityHubPage({
  initialTab = 'log',
  logs = [],
  onClearLogs,
  providers = [],
  showToast
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState(initialTab);

  const tabs = [
    { id: 'log', label: t('tabs.log'), icon: History },
    { id: 'transfers', label: t('tabs.transfers'), icon: ArrowLeftRight }
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

      {tab === 'log' && <ActivityPage logs={logs} onClearLogs={onClearLogs} />}
      {tab === 'transfers' && <TransfersPage providers={providers} showToast={showToast} />}
    </div>
  );
}
