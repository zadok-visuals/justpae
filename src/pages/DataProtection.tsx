
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Layout from '@/components/Layout';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Database, Server, UserCheck } from 'lucide-react';

const DataProtection = () => {
  return (

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="p-4 pb-24 space-y-6">
          {/* Header */}
          <div className="flex items-center space-x-4">
            <Link to="/settings">
              <Button variant="ghost" size="sm" className="p-2">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Data Protection</h1>
          </div>

          {/* Compliance Overview */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-lg text-gray-900 dark:text-white">
                <ShieldCheck className="w-5 h-5 text-fintech-blue" />
                <span>NDPR & GDPR Compliance</span>
              </CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We adhere to strict data protection standards, including the Nigeria Data Protection Regulation (NDPR) and General Data Protection Regulation (GDPR).
              </p>
            </CardHeader>
          </Card>

          {/* Data Handling */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-lg text-gray-900 dark:text-white">
                <Database className="w-5 h-5 text-purple-500" />
                <span>How We Protect Data</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <Server className="w-5 h-5 text-gray-400 mt-1" />
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Secure Infrastructure</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Our servers are located in secure facilities with multiple layers of physical and digital protection.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <UserCheck className="w-5 h-5 text-gray-400 mt-1" />
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Strict Access Control</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Only authorized personnel have access to sensitive user data, and all access is logged and audited.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Your Data Rights */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white">Your Data Rights</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-3">
                <li className="flex items-start">
                  <span className="text-fintech-blue mr-2 mt-1">•</span>
                  <span>Right to be informed about data collection and use</span>
                </li>
                <li className="flex items-start">
                  <span className="text-fintech-blue mr-2 mt-1">•</span>
                  <span>Right to access your personal data and supplemental information</span>
                </li>
                <li className="flex items-start">
                  <span className="text-fintech-blue mr-2 mt-1">•</span>
                  <span>Right to have inaccurate personal data rectified</span>
                </li>
                <li className="flex items-start">
                  <span className="text-fintech-blue mr-2 mt-1">•</span>
                  <span>Right to have personal data erased (Right to be forgotten)</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Data Breach Protocol */}
          <Card className="rounded-2xl shadow-sm bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white">Data Breach Protocol</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                In the unlikely event of a data breach, we have procedures in place to notify affected users and relevant authorities within the timeframes required by law.
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

export default DataProtection;
