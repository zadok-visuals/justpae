
import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Country {
  id: string;
  country_name: string;
  country_code: string;
  phone_code: string;
  flag_emoji: string;
}

interface CountrySelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  onPhoneCodeChange: (code: string) => void;
}

const CountrySelector: React.FC<CountrySelectorProps> = ({ value, onValueChange, onPhoneCodeChange }) => {
  const countries: Country[] = [
    { id: '1', country_name: 'Nigeria', country_code: 'NG', phone_code: '+234', flag_emoji: '🇳🇬' },
    { id: '2', country_name: 'United States', country_code: 'US', phone_code: '+1', flag_emoji: '🇺🇸' },
    { id: '3', country_name: 'United Kingdom', country_code: 'GB', phone_code: '+44', flag_emoji: '🇬🇧' },
    { id: '4', country_name: 'Canada', country_code: 'CA', phone_code: '+1', flag_emoji: '🇨🇦' },
    { id: '5', country_name: 'Germany', country_code: 'DE', phone_code: '+49', flag_emoji: '🇩🇪' },
    { id: '6', country_name: 'France', country_code: 'FR', phone_code: '+33', flag_emoji: '🇫🇷' },
    { id: '7', country_name: 'Australia', country_code: 'AU', phone_code: '+61', flag_emoji: '🇦🇺' },
    { id: '8', country_name: 'South Africa', country_code: 'ZA', phone_code: '+27', flag_emoji: '🇿🇦' },
    { id: '9', country_name: 'Ghana', country_code: 'GH', phone_code: '+233', flag_emoji: '🇬🇭' },
    { id: '10', country_name: 'Kenya', country_code: 'KE', phone_code: '+254', flag_emoji: '🇰🇪' },
    { id: '11', country_name: 'India', country_code: 'IN', phone_code: '+91', flag_emoji: '🇮🇳' },
    { id: '12', country_name: 'Brazil', country_code: 'BR', phone_code: '+55', flag_emoji: '🇧🇷' },
    { id: '13', country_name: 'Mexico', country_code: 'MX', phone_code: '+52', flag_emoji: '🇲🇽' },
    { id: '14', country_name: 'Japan', country_code: 'JP', phone_code: '+81', flag_emoji: '🇯🇵' },
    { id: '15', country_name: 'China', country_code: 'CN', phone_code: '+86', flag_emoji: '🇨🇳' },
    { id: '16', country_name: 'South Korea', country_code: 'KR', phone_code: '+82', flag_emoji: '🇰🇷' },
    { id: '17', country_name: 'Italy', country_code: 'IT', phone_code: '+39', flag_emoji: '🇮🇹' },
    { id: '18', country_name: 'Spain', country_code: 'ES', phone_code: '+34', flag_emoji: '🇪🇸' },
    { id: '19', country_name: 'Netherlands', country_code: 'NL', phone_code: '+31', flag_emoji: '🇳🇱' },
    { id: '20', country_name: 'Switzerland', country_code: 'CH', phone_code: '+41', flag_emoji: '🇨🇭' },
    { id: '21', country_name: 'Singapore', country_code: 'SG', phone_code: '+65', flag_emoji: '🇸🇬' },
    { id: '22', country_name: 'United Arab Emirates', country_code: 'AE', phone_code: '+971', flag_emoji: '🇦🇪' },
    { id: '23', country_name: 'Saudi Arabia', country_code: 'SA', phone_code: '+966', flag_emoji: '🇸🇦' },
    { id: '24', country_name: 'Egypt', country_code: 'EG', phone_code: '+20', flag_emoji: '🇪🇬' },
    { id: '25', country_name: 'Morocco', country_code: 'MA', phone_code: '+212', flag_emoji: '🇲🇦' }
  ];

  const handleValueChange = (selectedValue: string) => {
    const selectedCountry = countries.find(c => c.country_code === selectedValue);
    onValueChange(selectedValue);
    if (selectedCountry) {
      onPhoneCodeChange(selectedCountry.phone_code);
    }
  };

  return (
    <Select value={value} onValueChange={handleValueChange}>
      <SelectTrigger className="h-12 bg-white/5 border-white/10 rounded-xl text-white focus:ring-primary focus:border-primary focus:ring-2 focus:ring-offset-0 focus:ring-offset-transparent">
        <SelectValue placeholder="Select country" />
      </SelectTrigger>
      <SelectContent className="bg-fintech-card border-white/10 rounded-xl text-white">
        {countries.map((country) => (
          <SelectItem key={country.id} value={country.country_code} className="text-white hover:bg-white/5 focus:bg-white/5 focus:text-white rounded-lg cursor-pointer my-0.5">
            <div className="flex items-center gap-2">
              <span>{country.flag_emoji}</span>
              <span>{country.country_name}</span>
              <span className="text-gray-400">({country.phone_code})</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default CountrySelector;
