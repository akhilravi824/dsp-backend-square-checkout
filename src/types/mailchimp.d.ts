declare module '@mailchimp/mailchimp_marketing' {
  interface MailchimpClient {
    setConfig(config: { apiKey: string; server: string }): void;
    lists: {
      getListMember(audienceId: string, subscriberHash: string): Promise<any>;
      updateListMember(audienceId: string, subscriberHash: string, data: any): Promise<any>;
      updateListMemberTags(audienceId: string, subscriberHash: string, data: { tags: Array<{ name: string; status: 'active' | 'inactive' }> }): Promise<any>;
      addListMember(audienceId: string, data: any): Promise<any>;
    };
    helpers: {
      createMd5Hash(email: string): string;
    };
  }

  const mailchimp: MailchimpClient;
  export default mailchimp;
}
