
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Eye, Lock, FileText } from 'lucide-react';

const PrivacyPolicy = () => {
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
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Privacy Policy</h1>
          </div>
        </div>

          {/* Privacy Overview */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-lg text-gray-900 dark:text-white">
                <Shield className="w-5 h-5 text-fintech-blue" />
                <span>Your Privacy Matters</span>
              </CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We are committed to protecting your personal information and being transparent about how we use it.
              </p>
            </CardHeader>
          </Card>

          {/* Information We Collect */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-lg text-gray-900 dark:text-white">
                <Eye className="w-5 h-5 text-fintech-orange" />
                <span>Information We Collect</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Personal Information</h3>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-4">
                    <li>• Name, email address, and phone number</li>
                    <li>• Identity verification documents (for KYC)</li>
                    <li>• Bank account information for withdrawals</li>
                    <li>• Profile picture (optional)</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Transaction Data</h3>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-4">
                    <li>• Crypto and fiat transaction history</li>
                    <li>• Wallet balances and portfolio information</li>
                    <li>• Payment method details</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Technical Data</h3>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-4">
                    <li>• Device information and IP address</li>
                    <li>• App usage analytics</li>
                    <li>• Security logs and authentication data</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* How We Use Your Information */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-lg text-gray-900 dark:text-white">
                <FileText className="w-5 h-5 text-green-500" />
                <span>How We Use Your Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                <li className="flex items-start">
                  <span className="text-green-500 mr-2 mt-1">•</span>
                  <span>To provide and improve our financial services</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2 mt-1">•</span>
                  <span>To verify your identity and comply with regulations</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2 mt-1">•</span>
                  <span>To process transactions and send confirmations</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2 mt-1">•</span>
                  <span>To detect and prevent fraud and security threats</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2 mt-1">•</span>
                  <span>To communicate important updates about your account</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2 mt-1">•</span>
                  <span>To provide customer support when needed</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Data Security */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-lg text-gray-900 dark:text-white">
                <Lock className="w-5 h-5 text-red-500" />
                <span>Data Security</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <p>
                  We implement industry-standard security measures to protect your personal information:
                </p>
                <ul className="space-y-2 ml-4">
                  <li>• End-to-end encryption for all sensitive data</li>
                  <li>• Secure servers with 24/7 monitoring</li>
                  <li>• Regular security audits and updates</li>
                  <li>• Multi-factor authentication options</li>
                  <li>• PCI DSS compliance for payment processing</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Your Rights */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white">Your Rights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <p>You have the right to:</p>
                <ul className="space-y-2 ml-4">
                  <li>• Access and review your personal data</li>
                  <li>• Request corrections to inaccurate information</li>
                  <li>• Delete your account and associated data</li>
                  <li>• Export your transaction history</li>
                  <li>• Opt out of marketing communications</li>
                  <li>• File a complaint with regulatory authorities</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white">Contact Us</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <p>
                  If you have questions about this Privacy Policy or how we handle your data, please contact us:
                </p>
                <div className="space-y-2">
                  <p>Email: privacy@amazingpay.amazingpay</p>
                  <p>Phone: +234 903 266 8298</p>
                  <p>Address: Lagos, Nigeria</p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
                  Last updated: June 2025
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
  );
};

export default PrivacyPolicy;
