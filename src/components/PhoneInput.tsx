
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import CountrySelector from '@/components/CountrySelector';

interface PhoneInputProps {
  phone: string;
  phoneCode: string;
  country: string;
  onPhoneChange: (phone: string) => void;
  onPhoneCodeChange: (code: string) => void;
  onCountryChange: (country: string) => void;
}

const PhoneInput: React.FC<PhoneInputProps> = ({
  phone,
  phoneCode,
  country,
  onPhoneChange,
  onPhoneCodeChange,
  onCountryChange
}) => {
  return (
    <>
      <div>
        <Label htmlFor="country" className="block text-sm font-medium text-white">
          Country
        </Label>
        <div className="mt-1">
          <CountrySelector
            value={country}
            onValueChange={onCountryChange}
            onPhoneCodeChange={onPhoneCodeChange}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="phone" className="block text-sm font-medium text-white">
          Phone Number
        </Label>
        <div className="mt-1 flex">
          <div className="flex items-center px-3 py-2 border border-r-0 border-gray-600 rounded-l-md bg-gray-700 text-gray-300 text-sm">
            {phoneCode || '+234'}
          </div>
          <Input
            id="phone"
            name="phone"
            type="tel"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, ''))}
            className="appearance-none block w-full px-3 py-2 border border-gray-600 rounded-r-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary bg-gray-700 text-white"
            placeholder="Enter phone number"
          />
        </div>
      </div>
    </>
  );
};

export default PhoneInput;
