import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Target } from 'lucide-react';

const PromotionalBanner: React.FC = () => {
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  const banners = [
    {
      title: "Our Physical Offices",
      description: "For easy inquiries, complaint resolution/feedback, see our physical office locations.",
      buttonText: "Learn more",
      buttonLink: "https://www.justpae.app/", // added link
      icon: "₿",
      gradient: "from-purple-500 to-pink-500",
      target: "_blank"
    },
    {
      title: "24/7 Customer Support",
      description: "Get instant help anytime, anywhere. Our support team is always ready to assist you with your transactions.",
      buttonText: "Contact Support",
      buttonLink: "https://wa.me/2349032668298?text=Hello%2C%20I%20need%20help%20with%20my%20account", // added link 
      icon: "💬",
      gradient: "from-blue-500 to-teal-500",
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

  return (
    <Card className={`bg-gradient-to-r ${banners[currentBannerIndex].gradient} rounded-xl shadow-lg overflow-hidden h-32`}>
      <CardContent className="p-4 text-white relative h-full">
        <div className="flex items-center justify-between h-full py-2">
          <div className="flex-1">
            <h3 className="font-bold text-base mb-1">{banners[currentBannerIndex].title}</h3>
            <p className="text-xs opacity-90 mb-3">
              {banners[currentBannerIndex].description}
            </p>

            <Button
              onClick={handleButtonClick}
              className="bg-black text-white hover:bg-gray-800 text-xs px-3 py-1 h-6"
            >
              {banners[currentBannerIndex].buttonText}
            </Button>

          </div>
          <div className="w-12 h-12 bg-yellow-400 rounded-lg flex items-center justify-center ml-3">
            <span className="text-lg">{banners[currentBannerIndex].icon}</span>
          </div>
        </div>
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-1">
          {banners.map((_, index) => (
            <div
              key={index}
              className={`w-1.5 h-1.5 rounded-full ${index === currentBannerIndex ? 'bg-white' : 'bg-white/50'
                }`}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default PromotionalBanner;