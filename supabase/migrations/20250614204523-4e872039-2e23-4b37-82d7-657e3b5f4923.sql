
-- Update the admin password in system_settings to "Admin123"
UPDATE system_settings 
SET setting_value = 'Admin123' 
WHERE setting_key = 'admin_password';

-- Insert the admin password if it doesn't exist
INSERT INTO system_settings (setting_key, setting_value, description) 
VALUES ('admin_password', 'Admin123', 'Admin access password') 
ON CONFLICT (setting_key) 
DO UPDATE SET setting_value = 'Admin123';
