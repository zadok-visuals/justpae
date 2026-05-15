
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Scale, AlertCircle, CheckCircle2 } from 'lucide-react';

const TermsOfUse = () => {
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
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Terms of Use</h1>
          </div>
        </div>

          {/* Introduction */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-lg text-gray-900 dark:text-white">
                <Scale className="w-5 h-5 text-fintech-blue" />
                <span>Agreement to Terms</span>
              </CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                By accessing or using AmazingPay, you agree to be bound by these Terms of Use and our Privacy Policy.
              </p>
            </CardHeader>
          </Card>

          {/* User Responsibilities */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-lg text-gray-900 dark:text-white">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span>User Responsibilities</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Account Security</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Legal Compliance</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    You must use our services in compliance with all applicable local, state, and international laws and regulations.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Prohibited Activities */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-lg text-gray-900 dark:text-white">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>Prohibited Activities</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                <li className="flex items-start">
                  <span className="text-red-500 mr-2 mt-1">•</span>
                  <span>Engaging in fraudulent or deceptive practices</span>
                </li>
                <li className="flex items-start">
                  <span className="text-red-500 mr-2 mt-1">•</span>
                  <span>Using the platform for money laundering or illegal financing</span>
                </li>
                <li className="flex items-start">
                  <span className="text-red-500 mr-2 mt-1">•</span>
                  <span>Attempting to breach our security or reverse engineer our software</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Liability */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white">Limitation of Liability</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                To the maximum extent permitted by law, AmazingPay shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the platform.
              </p>
            </CardContent>
          </Card>

          {/* Termination */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white">Termination of Service</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We reserve the right to suspend or terminate your account at any time for violations of these terms or for security reasons.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
                Last updated: June 2025
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
  );
};

export default TermsOfUse;
