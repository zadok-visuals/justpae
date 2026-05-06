
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import Layout from '@/components/Layout';

const KYCVerification = () => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    nationality: '',
    address: '',
    city: '',
    postalCode: '',
    phoneNumber: '',
    idType: '',
    idNumber: ''
  });
  const [documents, setDocuments] = useState({
    idFront: null as File | null,
    idBack: null as File | null,
    selfie: null as File | null,
    proofOfAddress: null as File | null
  });
  const [isLoading, setIsLoading] = useState(false);
  const { updateKYCStatus } = useAuth();
  const { toast } = useToast();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = (field: string, file: File | null) => {
    setDocuments(prev => ({ ...prev, [field]: file }));
  };

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    
    try {
      // Simulate KYC processing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      updateKYCStatus(true);
      toast({
        title: "KYC Submitted Successfully!",
        description: "Your verification is being reviewed. You'll be notified within 24 hours.",
      });
      
      setStep(5); // Success step
    } catch (error) {
      toast({
        title: "Submission Failed",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  placeholder="Enter first name"
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  placeholder="Enter last name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Date of Birth</Label>
              <Input
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Nationality</Label>
              <Select value={formData.nationality} onValueChange={(value) => handleInputChange('nationality', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select nationality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us">United States</SelectItem>
                  <SelectItem value="uk">United Kingdom</SelectItem>
                  <SelectItem value="ca">Canada</SelectItem>
                  <SelectItem value="au">Australia</SelectItem>
                  <SelectItem value="de">Germany</SelectItem>
                  <SelectItem value="fr">France</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="Enter your full address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  placeholder="Enter city"
                />
              </div>
              <div className="space-y-2">
                <Label>Postal Code</Label>
                <Input
                  value={formData.postalCode}
                  onChange={(e) => handleInputChange('postalCode', e.target.value)}
                  placeholder="Enter postal code"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input
                value={formData.phoneNumber}
                onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>ID Type</Label>
              <Select value={formData.idType} onValueChange={(value) => handleInputChange('idType', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ID type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="passport">Passport</SelectItem>
                  <SelectItem value="drivers_license">Driver's License</SelectItem>
                  <SelectItem value="national_id">National ID Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ID Number</Label>
              <Input
                value={formData.idNumber}
                onChange={(e) => handleInputChange('idNumber', e.target.value)}
                placeholder="Enter ID number"
              />
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>ID Front</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload('idFront', e.target.files?.[0] || null)}
                />
              </div>
              <div className="space-y-2">
                <Label>ID Back</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload('idBack', e.target.files?.[0] || null)}
                />
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Selfie with ID</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileUpload('selfie', e.target.files?.[0] || null)}
              />
              <p className="text-xs text-gray-500">Take a clear selfie holding your ID next to your face</p>
            </div>
            <div className="space-y-2">
              <Label>Proof of Address</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileUpload('proofOfAddress', e.target.files?.[0] || null)}
              />
              <p className="text-xs text-gray-500">Bank statement, utility bill, or government letter (not older than 3 months)</p>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Important Notes:</h3>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• All documents must be clear and legible</li>
                <li>• Photos should be taken in good lighting</li>
                <li>• All information must match exactly</li>
                <li>• Review may take 24-48 hours</li>
              </ul>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center">
              <span className="text-3xl">✅</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-green-800">Verification Submitted!</h2>
              <p className="text-gray-600 mt-2">
                Your KYC documents have been submitted successfully. We'll review your information and notify you within 24 hours.
              </p>
            </div>
            <Button onClick={() => window.location.href = '/dashboard'} className="w-full">
              Return to Dashboard
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  if (step === 5) {
    return (
      <Layout>
        <div className="p-6 pb-24">
          <Card>
            <CardContent className="p-8">
              {renderStep()}
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 pb-24 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">KYC Verification</h1>
          <p className="text-gray-600">Complete verification to unlock all features</p>
        </div>

        <div className="flex items-center justify-between mb-6">
          {[1, 2, 3, 4].map((stepNumber) => (
            <div key={stepNumber} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                step >= stepNumber ? 'bg-fintech-blue text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {stepNumber}
              </div>
              {stepNumber < 4 && (
                <div className={`w-8 h-1 ${step > stepNumber ? 'bg-fintech-blue' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              Step {step}: {step === 1 ? 'Personal Information' : 
                         step === 2 ? 'Address Information' : 
                         step === 3 ? 'Identity Verification' : 
                         'Document Upload'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {renderStep()}
          </CardContent>
        </Card>

        <div className="flex space-x-4">
          {step > 1 && (
            <Button variant="outline" onClick={handleBack} className="flex-1">
              Back
            </Button>
          )}
          {step < 4 ? (
            <Button onClick={handleNext} className="flex-1">
              Next
            </Button>
          ) : (
            <Button 
              onClick={handleSubmit} 
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? 'Submitting...' : 'Submit for Review'}
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default KYCVerification;
