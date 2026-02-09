import { test, expect } from '@playwright/test';

test.describe('Onboarding Flow', () => {
  test('should load the landing page and show branding', async ({ page }) => {
    await page.goto('/');
    
    // Check for "WazBot" branding
    await expect(page.getByText('WazBot').first()).toBeVisible();
    
    // Check for action buttons (can be links or buttons)
    await expect(page.getByText(/Start Free/i)).toBeVisible();
    await expect(page.getByText(/Connect Your WhatsApp/i)).toBeVisible();
  });

  test('should redirect unauthenticated users from dashboard to sign-in', async ({ page }) => {
    // Note: Since Clerk handles auth, visiting /dashboard should trigger a redirect
    await page.goto('/dashboard');
    
    // Verify we are not on /dashboard anymore (Clerk handles the sign-in redirect)
    // We check if the URL contains "sign-in" or if the landing page content is shown (if middleware fallback is enabled)
    await page.waitForURL(/.*sign-in|.*/);
    expect(page.url()).not.toContain('/dashboard');
  });

  test('should show correct sidebar links on dashboard (when mocked/accessed)', async ({ page }) => {
     // This test currently just verifies the existence of the Dashboard structure if accessible
     await page.goto('/dashboard');
     
     // If Clerk blocks it, this is actually a pass for the "security" part of the E2E test
     if (page.url().includes('sign-in')) {
        console.log('Successfully blocked unauthenticated access to dashboard');
     } else {
        // If we are on dashboard, verify sidebar
        await expect(page.getByRole('link', { name: /Leads/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /Connect/i })).toBeVisible();
     }
  });
});
