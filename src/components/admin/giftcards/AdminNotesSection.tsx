
import React from 'react';
import { Textarea } from '@/components/ui/textarea';

interface AdminNotesSectionProps {
  adminNotes: string;
  setAdminNotes: (notes: string) => void;
}

const AdminNotesSection: React.FC<AdminNotesSectionProps> = ({ adminNotes, setAdminNotes }) => {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Admin Notes
      </label>
      <Textarea
        value={adminNotes}
        onChange={(e) => setAdminNotes(e.target.value)}
        placeholder="Add notes about this gift card submission..."
        className="min-h-[100px] bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white"
      />
    </div>
  );
};

export default AdminNotesSection;
