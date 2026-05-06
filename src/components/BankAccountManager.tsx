
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Trash2, Plus, Building2 } from 'lucide-react';

interface BankAccount {
  id: string;
  account_name: string;
  account_number: string;
  bank_name: string;
  bank_code?: string;
  is_default: boolean;
  is_verified: boolean;
}

interface BankAccountManagerProps {
  onAccountSelect: (account: BankAccount) => void;
  selectedAccountId?: string;
}

const BankAccountManager: React.FC<BankAccountManagerProps> = ({
  onAccountSelect,
  selectedAccountId
}) => {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const [newAccount, setNewAccount] = useState({
    account_name: '',
    account_number: '',
    bank_name: '',
    bank_code: ''
  });

  useEffect(() => {
    if (user) {
      fetchBankAccounts();
    }
  }, [user]);

  const fetchBankAccounts = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false });

      if (error) {
        console.error('Error fetching bank accounts:', error);
        toast({
          title: "Error",
          description: "Failed to load bank accounts",
          variant: "destructive",
        });
      } else {
        setAccounts(data || []);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (accounts.length >= 3) {
      toast({
        title: "Limit Reached",
        description: "You can only add up to 3 bank accounts",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('bank_accounts')
        .insert({
          user_id: user.id,
          account_name: newAccount.account_name,
          account_number: newAccount.account_number,
          bank_name: newAccount.bank_name,
          bank_code: newAccount.bank_code || null,
          is_default: accounts.length === 0,
          is_verified: false
        });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Bank account added successfully",
        });
        setNewAccount({
          account_name: '',
          account_number: '',
          bank_name: '',
          bank_code: ''
        });
        setShowAddForm(false);
        fetchBankAccounts();
      }
    } catch (error) {
      console.error('Error adding bank account:', error);
      toast({
        title: "Error",
        description: "Failed to add bank account",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from('bank_accounts')
        .delete()
        .eq('id', accountId);

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Bank account deleted successfully",
        });
        fetchBankAccounts();
      }
    } catch (error) {
      console.error('Error deleting bank account:', error);
      toast({
        title: "Error",
        description: "Failed to delete bank account",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading bank accounts...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Bank Accounts</h3>
        {accounts.length < 3 && (
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            variant="outline"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Account
          </Button>
        )}
      </div>

      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add New Bank Account</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddAccount} className="space-y-4">
              <div>
                <Label htmlFor="account_name">Account Name</Label>
                <Input
                  id="account_name"
                  value={newAccount.account_name}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, account_name: e.target.value }))}
                  placeholder="John Doe"
                  required
                />
              </div>

              <div>
                <Label htmlFor="account_number">Account Number</Label>
                <Input
                  id="account_number"
                  value={newAccount.account_number}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, account_number: e.target.value }))}
                  placeholder="0123456789"
                  required
                />
              </div>

              <div>
                <Label htmlFor="bank_name">Bank Name</Label>
                <Input
                  id="bank_name"
                  value={newAccount.bank_name}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, bank_name: e.target.value }))}
                  placeholder="First Bank of Nigeria"
                  required
                />
              </div>

              <div>
                <Label htmlFor="bank_code">Bank Code (Optional)</Label>
                <Input
                  id="bank_code"
                  value={newAccount.bank_code}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, bank_code: e.target.value }))}
                  placeholder="011"
                />
              </div>

              <div className="flex space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-fintech-orange hover:bg-fintech-orange/90"
                >
                  {saving ? 'Adding...' : 'Add Account'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {accounts.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <Building2 className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                No bank accounts added yet. Add one to start withdrawing funds.
              </p>
            </CardContent>
          </Card>
        ) : (
          accounts.map((account) => (
            <Card
              key={account.id}
              className={`cursor-pointer transition-colors ${
                selectedAccountId === account.id
                  ? 'border-fintech-orange bg-orange-50 dark:bg-orange-950/20'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              onClick={() => onAccountSelect(account)}
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">{account.account_name}</h4>
                      {account.is_default && (
                        <span className="px-2 py-1 text-xs bg-fintech-orange text-white rounded">
                          Default
                        </span>
                      )}
                      {account.is_verified && (
                        <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                          Verified
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {account.bank_name}
                    </p>
                    <p className="text-sm font-mono">
                      ****{account.account_number.slice(-4)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteAccount(account.id);
                    }}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {accounts.length >= 3 && (
        <p className="text-sm text-gray-500 text-center">
          Maximum of 3 bank accounts reached. Delete an account to add a new one.
        </p>
      )}
    </div>
  );
};

export default BankAccountManager;
