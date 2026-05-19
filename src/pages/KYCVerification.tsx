import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ShieldCheck, Phone, FileText, Upload, CheckCircle2, User, MapPin } from 'lucide-react';
import { useZeroHash } from '@/hooks/useZeroHash';

const KYCVerification = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { createParticipant } = useZeroHash();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('US');
  const [document, setDocument] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber || !document || !dob || !address || !city || !state || !postalCode) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // 1. Create Zero Hash Participant
      const nameParts = (profile?.full_name || profile?.name || '').split(' ');
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Unknown';

      const zhResponse = await createParticipant({
        firstName,
        lastName,
        dob,
        address,
        city,
        state,
        postalCode,
        country
      });

      if (!zhResponse || zhResponse.error) {
        throw new Error(zhResponse?.error || "Failed to register Zero Hash participant");
      }

      const participantCode = zhResponse.participant_code;

      // 2. Upload Document to Supabase Storage
      const fileExt = document.name.split('.').pop();
      const fileName = `${user?.id}/address_proof_${Date.now()}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('kyc-documents')
        .upload(fileName, document);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('kyc-documents')
        .getPublicUrl(uploadData.path);

      // 3. Update User Profile with KYC Data
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          kyc_phone_number: phoneNumber,
          kyc_address_proof_url: publicUrl,
          kyc_submitted_at: new Date().toISOString(),
          is_kyc_verified: false,
          zero_hash_participant_code: participantCode
        })
        .eq('id', user?.id);

      if (updateError) throw updateError;

      setIsSubmitted(true);
      toast({
        title: "KYC Submitted!",
        description: "Your Zero Hash wallet has been initiated.",
      });
    } catch (error: any) {
      console.error('KYC Error:', error);
      toast({
        title: "Submission Failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (

        <div className="max-w-md mx-auto pt-12 pb-24 px-4">
          <Card className="text-center p-8 border-green-100 bg-green-50/30">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Verification Pending</h2>
            <p className="text-gray-600 mb-8">
              We've received your documents! You'll receive a notification as soon as our team completes the review.
            </p>
            <Button onClick={() => window.location.href = '/dashboard'} className="w-full bg-fintech-blue hover:bg-fintech-blue/90">
              Return to Dashboard
            </Button>
          </Card>
        </div>

    );
  }

  return (
      <div className="max-w-2xl mx-auto pt-8 pb-24 px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-fintech-blue/10 rounded-full mb-4">
            <ShieldCheck className="w-8 h-8 text-fintech-blue" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Identity Verification</h1>
          <p className="text-gray-600 mt-2">Complete this quick step to secure your account and unlock higher limits.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="overflow-hidden border-gray-200 shadow-sm">
            <CardHeader className="bg-gray-50 border-b border-gray-100 py-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="w-4 h-4 text-fintech-blue" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+234 800 000 0000"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="h-12 text-lg"
                  required
                />
                <p className="text-xs text-gray-500 italic">We'll use this for security alerts and account recovery.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-gray-200 shadow-sm">
            <CardHeader className="bg-gray-50 border-b border-gray-100 py-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-4 h-4 text-fintech-blue" />
                Personal Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dob">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="h-12"
                  required
                />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-gray-200 shadow-sm">
            <CardHeader className="bg-gray-50 border-b border-gray-100 py-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-4 h-4 text-fintech-blue" />
                Residential Address
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label>Street Address</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="New York" required />
                </div>
                <div className="space-y-2">
                  <Label>State / Province</Label>
                  <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="NY" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Postal Code</Label>
                  <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="10001" required />
                </div>
                <div className="space-y-2">
                  <Label>Country Code</Label>
                  <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="US" maxLength={2} required />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-gray-200 shadow-sm">
            <CardHeader className="bg-gray-50 border-b border-gray-100 py-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-4 h-4 text-fintech-blue" />
                Proof of Address
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-center w-full">
                  <label className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                    document ? 'border-green-400 bg-green-50/50' : 'border-gray-200 bg-gray-50/50 hover:border-fintech-blue/40'
                  }`}>
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
                      {document ? (
                        <>
                          <CheckCircle2 className="w-10 h-10 text-green-500 mb-3" />
                          <p className="text-sm font-medium text-green-700">{document.name}</p>
                          <p className="text-xs text-green-600 mt-1">File ready for upload</p>
                        </>
                      ) : (
                        <>
                          <Upload className="w-10 h-10 text-gray-400 mb-3" />
                          <p className="text-sm font-medium text-gray-700">Click to upload or drag and drop</p>
                          <p className="text-xs text-gray-500 mt-1">Bank Statement or Utility Bill (PDF, JPG, PNG)</p>
                        </>
                      )}
                    </div>
                    <input 
                      type="file" 
                      className="hidden" 
                      onChange={(e) => setDocument(e.target.files?.[0] || null)}
                      accept=".pdf,image/*"
                      required
                    />
                  </label>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg flex gap-3">
                  <div className="shrink-0 w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                    <span className="text-blue-700 text-[10px] font-bold">i</span>
                  </div>
                  <p className="text-xs text-blue-700 leading-relaxed">
                    Document must be issued within the last 3 months and clearly show your full name and current residential address.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button 
            type="submit" 
            disabled={isLoading || !phoneNumber || !document}
            className="w-full h-14 text-lg font-bold bg-fintech-blue hover:bg-fintech-blue/90 shadow-lg shadow-fintech-blue/20 transition-all"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing Verification...
              </span>
            ) : (
              "Submit Verification"
            )}
          </Button>
          
          <p className="text-center text-xs text-gray-500">
            By submitting, you agree to our verification terms. Review typically takes less than 24 hours.
          </p>
        </form>
      </div>
  );
};

export default KYCVerification;
