
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';

interface KYCVerificationBannerProps {
  isKycVerified: boolean;
}

const KYCVerificationBanner: React.FC<KYCVerificationBannerProps> = ({
  isKycVerified
}) => {
  if (isKycVerified) return null;

  return (
    <div className="bg-primary/10 border border-primary/25 rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 shrink-0 bg-primary/15 text-primary rounded-full flex items-center justify-center">
          <ShieldAlert className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-foreground">Complete your verification</h3>
          <p className="text-xs text-muted-foreground">Complete KYC to unlock all features</p>
        </div>
        <Link to="/kyc">
          <Button size="sm" className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground">
            Verify Now
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default KYCVerificationBanner;
