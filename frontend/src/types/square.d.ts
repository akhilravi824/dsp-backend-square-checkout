// Type definitions for Square Web Payments SDK
interface Window {
  Square?: {
    payments: (applicationId: string, locationId: string) => {
      card: () => any;
    }
  }
}
