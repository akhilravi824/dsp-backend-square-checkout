declare module '@mailchimp/mailchimp_marketing' {
  interface MailchimpConfig {
    apiKey: string;
    server: string;
  }

  interface MergeFields {
    [key: string]: string;
  }

  interface Tag {
    name: string;
    status: 'active' | 'inactive';
  }

  interface ListMemberRequest {
    email_address: string;
    status?: 'subscribed' | 'unsubscribed' | 'cleaned' | 'pending' | 'transactional';
    merge_fields?: MergeFields;
    tags?: string[] | Tag[];
  }

  interface Lists {
    getListMember(listId: string, subscriberHash: string): Promise<any>;
    updateListMember(listId: string, subscriberHash: string, data: ListMemberRequest): Promise<any>;
    addListMember(listId: string, data: ListMemberRequest): Promise<any>;
  }

  const lists: Lists;

  function setConfig(config: MailchimpConfig): void;
}
