import React from 'react';
import { Clock, Printer, CheckCircle2, XCircle } from 'lucide-react';

const StatusBadge = ({ status }) => {
  const normalized = status
    ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
    : 'Pending';

  let badgeClass = 'status-badge status-pending';
  let Icon = Clock;

  switch (normalized) {
    case 'Pending':
      badgeClass = 'status-badge status-pending';
      Icon = Clock;
      break;
    case 'Printing':
      badgeClass = 'status-badge status-printing';
      Icon = Printer;
      break;
    case 'Completed':
      badgeClass = 'status-badge status-completed';
      Icon = CheckCircle2;
      break;
    case 'Cancelled':
      badgeClass = 'status-badge status-cancelled';
      Icon = XCircle;
      break;
    default:
      badgeClass = 'status-badge status-pending';
      Icon = Clock;
  }

  return (
    <span className={badgeClass}>
      <Icon size={14} className="badge-icon" />
      <span className="badge-label">{normalized}</span>
    </span>
  );
};

export default StatusBadge;
