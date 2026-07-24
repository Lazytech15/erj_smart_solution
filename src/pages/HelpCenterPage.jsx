import { useState } from 'react';
import { LifeBuoy, ChevronDown, Mail, MessageSquare, BookOpen } from 'lucide-react';
import { SectionHeader } from '../components/ui';

const FAQS = [
  {
    q: 'Why was I signed out automatically?',
    a: "For security, sessions without \u201CRemember me\u201D end after 30 minutes of inactivity or at midnight, whichever comes first. Checking \u201CRemember me\u201D on login keeps you signed in for 24 hours instead.",
  },
  {
    q: 'How do I change my display name or password?',
    a: 'Open Profile from the sidebar. You can update your display name, avatar color, and password there.',
  },
  {
    q: 'How do I add or edit employees?',
    a: 'Go to Employees in the sidebar (visible to admins, HR, and managers). Use "Add employee" to create a new record, or click an existing employee to edit their details.',
  },
  {
    q: 'How does attendance tracking work?',
    a: 'Attendance entries can come from biometric device sync or manual entry, depending on your plan. Check the Attendance page for daily logs and the Reports page for summaries.',
  },
  {
    q: 'Who can access Settings and Reports?',
    a: 'Settings is limited to admins. Reports are available to admins, HR, and managers. Shifts and Departments require a plan that includes those features.',
  },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-surface-100 last:border-b-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 py-3.5 text-left"
      >
        <span className="text-sm font-medium text-ink-800">{q}</span>
        <ChevronDown
          size={15}
          className="text-ink-300 shrink-0 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      {open && <p className="text-sm text-ink-500 leading-relaxed pb-3.5 pr-6">{a}</p>}
    </div>
  );
}

export default function HelpCenterPage() {
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Help Center"
        description="Answers to common questions, and how to reach us if you're still stuck."
      />

      <div className="card p-5">
        <div className="flex items-center gap-2.5 mb-1 pb-3 border-b border-surface-100">
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
            <BookOpen size={15} className="text-brand-600" />
          </div>
          <p className="font-semibold text-sm text-ink-900">Frequently asked questions</p>
        </div>
        <div>
          {FAQS.map(f => <FaqItem key={f.q} {...f} />)}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-surface-100">
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
            <LifeBuoy size={15} className="text-brand-600" />
          </div>
          <p className="font-semibold text-sm text-ink-900">Still need help?</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <a
            href="mailto:support@erjsmartsolutions.com"
            className="flex items-center gap-3 p-3.5 rounded-xl border border-surface-200 hover:border-brand-300 hover:bg-brand-50/40 transition-colors"
          >
            <Mail size={16} className="text-brand-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-ink-800">Email support</p>
              <p className="text-xs text-ink-400">support@erjsmartsolutions.com</p>
            </div>
          </a>
          <div className="flex items-center gap-3 p-3.5 rounded-xl border border-surface-200">
            <MessageSquare size={16} className="text-brand-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-ink-800">Live chat</p>
              <p className="text-xs text-ink-400">Mon–Fri, 9AM–6PM (PH time)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
