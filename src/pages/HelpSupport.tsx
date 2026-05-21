
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Instagram } from 'lucide-react';

const HelpSupport = () => {
  const handleWhatsAppChat = () => {
    window.open('https://wa.me/2349032668298?text=Hello%2C%20I%20need%20help%20with%20my%20account', '_blank');
  };

  const handleInstagramChat = () => {
    window.open('https://www.instagram.com/amazingexchange_/?hl=en', '_blank');
  };

  return (
    <div className="w-full bg-gray-50 dark:bg-gray-900 flex flex-col relative">
      <div className="flex-1 w-full max-w-2xl mx-auto p-4 space-y-6">
        {/* Sticky Header Section */}
        <div className="sticky top-0 z-30 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-md -mx-4 px-4 sm:-mx-6 sm:px-6 pt-2 pb-2 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center space-x-4">
            <Link to="/settings">
              <Button variant="ghost" size="sm" className="p-2 text-gray-600 dark:text-gray-300">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Help & Support</h1>
          </div>
        </div>

          {/* Contact Options */}
          <div className="space-y-4">
            <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900 dark:text-white">Contact Admin</CardTitle>
                <p className="text-sm text-gray-600 dark:text-gray-400">Get instant help from our support team</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  onClick={handleWhatsAppChat}
                  className="w-full bg-green-500 hover:bg-green-600 text-white flex items-center space-x-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>Chat on WhatsApp</span>
                </Button>
                
                <Button 
                  onClick={handleInstagramChat}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white flex items-center space-x-2"
                >
                  <Instagram className="w-5 h-5" />
                  <span>Chat on Instagram</span>
                </Button>
              </CardContent>
            </Card>

            {/* FAQ Section */}
            <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900 dark:text-white">Frequently Asked Questions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="border-b border-gray-200 dark:border-gray-700 pb-3">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">How long do withdrawals take?</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Withdrawals are typically processed within 24 hours during business days.</p>
                  </div>
                  
                  <div className="border-b border-gray-200 dark:border-gray-700 pb-3">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">What are the transaction fees?</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">We charge a flat fee of ₦50 for withdrawals and competitive rates for crypto transactions.</p>
                  </div>
                  
                  <div className="border-b border-gray-200 dark:border-gray-700 pb-3">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">How do I verify my account?</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Complete your KYC verification by uploading your ID and other required documents in the Profile section.</p>
                  </div>
                  
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Is my money safe?</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Yes, we use bank-grade security and your funds are protected with multi-layer encryption.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact Hours */}
            <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900 dark:text-white">Support Hours</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex justify-between">
                    <span>Monday - Friday:</span>
                    <span className="font-semibold">24/7</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Saturday:</span>
                    <span className="font-semibold">24/7</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sunday:</span>
                    <span className="font-semibold">24/7</span>
                  </div>
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-blue-800 dark:text-blue-200 text-xs">
                      For urgent issues outside business hours, please use WhatsApp or Instagram for faster response.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
  );
};

export default HelpSupport;
