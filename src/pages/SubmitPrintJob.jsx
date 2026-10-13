import React from 'react';
import PrintJobForm from '../components/PrintJobForm';
import { Printer, Info, CheckCircle2 } from 'lucide-react';

const SubmitPrintJob = () => {
  return (
    <div className="page-container page-container-narrow">
      <div className="page-header">
        <h1 className="page-title">Submit Print Job</h1>
        <p className="page-subtitle">
          Send your document to the shared campus printer.
        </p>
      </div>

      <div className="info-callout">
        <div className="info-callout-icon">
          <Info size={20} />
        </div>
        <div className="info-callout-content">
          <h4>How the Print Queue Works</h4>
          <ul>
            <li>Your job is automatically positioned by arrival time (<strong>First-Come, First-Served</strong>).</li>
            <li>No manual priority is used; everyone is treated fairly.</li>
            <li>You can cancel a job as long as it remains in <strong>Pending</strong> status.</li>
          </ul>
        </div>
      </div>

      <PrintJobForm />
    </div>
  );
};

export default SubmitPrintJob;
