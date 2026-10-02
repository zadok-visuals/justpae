import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, MessageCircle } from 'lucide-react';

const PromotionalBanner: React.FC = () => {
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  const banners = [
    {
      eyebrow: "Support",
      title: "Our physical offices",
      description: "For inquiries, complaints or feedback, see our physical office locations.",
      buttonText: "Learn more",
      buttonLink: "https://www.justpae.vercel.app/",
      icon: Building2,
      target: "_blank"
    },
    {
      eyebrow: "Always on",
      title: "24/7 customer support",
      description: "Get instant help anytime, anywhere — our team is always ready to assist.",
      buttonText: "Contact support",
      buttonLink: "https://wa.me/2349032668298?text=Hello%2C%20I%20need%20help%20with%20my%20account",
      icon: MessageCircle,
      target: "_blank"
    }
  ];

  useEffect(() => {
    const bannerInterval = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % banners.length);
    }, 5000);

    return () => clearInterval(bannerInterval);
  }, []);

  const handleButtonClick = () => {
    window.open(banners[currentBannerIndex].buttonLink, banners[currentBannerIndex].target);
  };

  const ActiveIcon = banners[currentBannerIndex].icon;

  return (
    <Card className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-1.5">
              {banners[currentBannerIndex].eyebrow}
            </p>
            <h3 className="font-semibold text-base text-foreground mb-1">
              {banners[currentBannerIndex].title}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4 max-w-sm">
              {banners[currentBannerIndex].description}
            </p>
            <Button
              onClick={handleButtonClick}
              size="sm"
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-4 h-8"
            >
              {banners[currentBannerIndex].buttonText}
            </Button>
          </div>
          <div className="w-11 h-11 shrink-0 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
            <ActiveIcon className="w-5 h-5" />
          </div>
        </div>
        <div className="flex justify-center gap-1.5 mt-4">
          {banners.map((_, index) => (
            <div
              key={index}
              className={`h-1.5 rounded-full transition-all ${
                index === currentBannerIndex ? 'w-4 bg-primary' : 'w-1.5 bg-border'
              }`}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default PromotionalBanner;
