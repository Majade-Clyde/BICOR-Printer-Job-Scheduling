import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const StatCard = ({
  title,
  value,
  icon: Icon,
  variant = 'blue',
  description,
  to,
  onClick,
}) => {
  const navigate = useNavigate();

  const isClickable = Boolean(to || onClick);

  const handleClick = (e) => {
    if (onClick) {
      onClick(e);
    } else if (to) {
      navigate(to);
    }
  };

  const handleKeyDown = (e) => {
    if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handleClick(e);
    }
  };

  return (
    <div
      className={`stat-card stat-card-${variant} ${isClickable ? 'stat-card-clickable' : ''}`}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? `View ${title}: ${value} ${description || ''}` : undefined}
    >
      <div className="stat-card-header">
        {Icon && (
          <div className={`stat-card-icon-wrapper stat-card-icon-${variant}`}>
            <Icon size={20} />
          </div>
        )}
        <div className="stat-card-title-wrap">
          <span className="stat-card-title">{title}</span>
          <ChevronRight size={14} className="stat-card-chevron" />
        </div>
      </div>
      <div className="stat-card-content">
        <div className="stat-card-value">{value}</div>
        {description && <div className="stat-card-desc">{description}</div>}
      </div>
      {/* Decorative subtle organic bottom wave */}
      <div className={`stat-card-wave stat-card-wave-${variant}`} aria-hidden="true">
        <svg viewBox="0 0 200 60" preserveAspectRatio="none" fill="currentColor">
          <path d="M0,40 C60,15 130,55 200,20 L200,60 L0,60 Z" />
        </svg>
      </div>
    </div>
  );
};

export default StatCard;
