
import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
  showHelpText?: boolean;
  required?: boolean;
  className?: string;
}

const PasswordInput: React.FC<PasswordInputProps> = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  showHelpText = false,
  required = false,
  className = ""
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={className}>
      <Label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </Label>
      <div className="mt-1 relative">
        <Input
          id={id}
          name={id}
          type={showPassword ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none block w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-fintech-orange focus:border-fintech-orange bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          placeholder={placeholder}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 pr-3 flex items-center"
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
          ) : (
            <Eye className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
          )}
        </button>
      </div>
      {showHelpText && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Must contain uppercase, lowercase letters and numbers (min 8 characters)
        </p>
      )}
    </div>
  );
};

export default PasswordInput;
