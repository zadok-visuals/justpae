
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
      <div className="space-y-2">
        <Label htmlFor="country" className="text-sm font-semibold text-gray-300 ml-1">
          Country
        </Label>
        <div>
          <CountrySelector
            value={country}
            onValueChange={onCountryChange}
            onPhoneCodeChange={onPhoneCodeChange}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone" className="text-sm font-semibold text-gray-300 ml-1">
          Phone Number
        </Label>
        <div className="flex">
          <div className="h-12 flex items-center px-4 border border-r-0 border-white/10 rounded-l-xl bg-white/5 text-gray-300 text-sm shrink-0">
            {phoneCode || '+234'}
          </div>
          <Input
            id="phone"
            name="phone"
            type="tel"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, ''))}
            className="h-12 appearance-none block w-full px-4 border border-white/10 rounded-r-xl shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary bg-white/5 text-white focus:ring-2 focus:ring-offset-0 focus:ring-offset-transparent"
            placeholder="Enter phone number"
          />
        </div>
      </div>
    </>
  );
};

export default PhoneInput;
