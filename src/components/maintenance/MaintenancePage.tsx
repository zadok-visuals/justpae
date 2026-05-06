
import React from 'react';
import { AlertTriangle } from 'lucide-react';

const MaintenancePage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md mx-auto bg-white dark:bg-gray-900 min-h-screen shadow-xl relative flex flex-col items-center justify-center p-4 text-center">
        <AlertTriangle className="w-16 h-16 text-yellow-500 mb-6" />
        <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-3">
          Under Maintenance
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 max-w-md">
          We are currently performing scheduled maintenance. We should be back online shortly. Thank you for your patience.
        </p>
      </div>
    </div>
  );
};

export default MaintenancePage;
