// Using require instead of import to avoid TypeScript errors
// @ts-ignore
const mailchimp = require('@mailchimp/mailchimp_marketing');
import crypto from 'crypto';

/**
 * Service for interacting with Mailchimp API
 */
class MailchimpService {
  private _initialized = false;
  private _audienceId = '';

  /**
   * Initialize the Mailchimp service with API credentials
   */
  initialize(apiKey: string, serverPrefix: string, audienceId: string): void {
    if (!apiKey || !serverPrefix || !audienceId) {
      console.error('Missing required Mailchimp credentials');
      this._initialized = false;
      return;
    }

    try {
      mailchimp.setConfig({
        apiKey,
        server: serverPrefix,
      });

      this._audienceId = audienceId;
      this._initialized = true;
      console.log('Mailchimp client initialized successfully');
    } catch (error) {
      console.error('Error initializing Mailchimp client:', error);
      this._initialized = false;
    }
  }

  /**
   * Check if the Mailchimp service is initialized
   */
  isInitialized(): boolean {
    return this._initialized && !!this._audienceId;
  }

  /**
   * Get MD5 hash of email for Mailchimp subscriber ID
   */
  private _getSubscriberHash(email: string): string {
    return crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
  }

  /**
   * Update user tags in Mailchimp based on notification preferences
   */
  async updateUserTags(
    email: string,
    name: string,
    tipsAndGuidance: boolean,
    productUpdates: boolean
  ): Promise<any> {
    if (!this.isInitialized()) {
      throw new Error('Mailchimp service not initialized');
    }

    if (!email) {
      throw new Error('Email is required');
    }

    try {
      // Prepare tags based on user preferences
      const updateTags = [
        {
          name: 'Tips, tricks and helpful guidance',
          status: tipsAndGuidance ? 'active' : 'inactive',
        },
        {
          name: 'Product updates and learning tips',
          status: productUpdates ? 'active' : 'inactive',
        },
      ];
      
      // For creating new members, we need an array of strings for active tags only
      const createTags = [
        ...(tipsAndGuidance ? ['Tips, tricks and helpful guidance'] : []),
        ...(productUpdates ? ['Product updates and learning tips'] : []),
      ];
      
      console.log('Updating Mailchimp tags for user:', email);
      console.log('Update tags format:', JSON.stringify(updateTags));
      console.log('Create tags format:', JSON.stringify(createTags));

      // Split name into first and last name
      let firstName = name;
      let lastName = '';
      if (name && name.includes(' ')) {
        const nameParts = name.split(' ');
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ');
      }

      // Hash the email for the subscriber ID
      const subscriberHash = this._getSubscriberHash(email);

      // Check if the member exists
      try {
        // First check if the member exists
        await mailchimp.lists.getListMember(this._audienceId, subscriberHash);
        console.log('Member exists in Mailchimp, updating profile and tags');
        
        // Update the member's basic info first
        await mailchimp.lists.updateListMember(this._audienceId, subscriberHash, {
          email_address: email,
          merge_fields: {
            FNAME: firstName,
            LNAME: lastName,
          }
        });
        
        // Then update the tags using the dedicated endpoint
        const tagUpdateResult = await mailchimp.lists.updateListMemberTags(
          this._audienceId,
          subscriberHash,
          { tags: updateTags }
        );
        
        console.log('Mailchimp tag update response:', JSON.stringify(tagUpdateResult));
        return tagUpdateResult;
      } catch (error) {
        console.log('Member does not exist in Mailchimp, creating new member');
        // Member doesn't exist, create new
        try {
          const createResult = await mailchimp.lists.addListMember(this._audienceId, {
            email_address: email,
            status: 'subscribed',
            merge_fields: {
              FNAME: firstName,
              LNAME: lastName,
            },
            tags: createTags,
          });
          console.log('Mailchimp create response:', JSON.stringify(createResult));
          return createResult;
        } catch (createError: any) {
          // Check if this is a "Member Exists" error, which can happen if the member was created between our check and create
          if (createError.response && createError.response.body && createError.response.body.title === 'Member Exists') {
            console.log(`Contact ${email} already exists in Mailchimp - attempting to update instead`);
            
            // Try updating the member instead
            await mailchimp.lists.updateListMember(this._audienceId, subscriberHash, {
              email_address: email,
              merge_fields: {
                FNAME: firstName,
                LNAME: lastName,
              }
            });
            
            // Then update the tags
            const tagUpdateResult = await mailchimp.lists.updateListMemberTags(
              this._audienceId,
              subscriberHash,
              { tags: updateTags }
            );
            
            console.log('Mailchimp tag update response after Member Exists error:', JSON.stringify(tagUpdateResult));
            
            return {
              status: 'subscribed',
              email_address: email,
              already_exists: true,
              tags_updated: true
            };
          }
          
          // For any other error, rethrow
          throw createError;
        }
      }
    } catch (error: any) {
      // Check if this is a "Member Exists" error at the top level
      if (error.response && error.response.body && error.response.body.title === 'Member Exists') {
        console.log(`Contact ${email} already exists in Mailchimp`);
        
        // Return a success response with the member exists info
        return {
          status: 'subscribed',
          email_address: email,
          already_exists: true,
          detail: error.response.body.detail
        };
      }
      
      console.error('Error updating Mailchimp tags:', error);
      throw error;
    }
  }

  /**
   * Update a contact's name in Mailchimp
   * @param email User email
   * @param name New name value
   * @returns Result of the operation
   */
  async updateContactName(email: string, name: string): Promise<any> {
    if (!this.isInitialized()) {
      throw new Error('Mailchimp service not initialized');
    }

    if (!email) {
      throw new Error('Email is required');
    }

    try {
      console.log(`Updating name for Mailchimp contact: ${email} to: ${name}`);

      // Split name into first and last name
      let firstName = name;
      let lastName = '';
      
      if (name && name.includes(' ')) {
        const nameParts = name.split(' ');
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ');
      }

      // Hash the email for the subscriber ID
      const subscriberHash = this._getSubscriberHash(email);

      // Update the member's basic info
      const updateResult = await mailchimp.lists.updateListMember(this._audienceId, subscriberHash, {
        merge_fields: {
          FNAME: firstName,
          LNAME: lastName,
        }
      });
      
      console.log('Mailchimp contact name updated successfully');
      return updateResult;
    } catch (error: any) {
      // Check if this is a "Member Not Found" error
      if (error.response && error.response.body && error.response.body.title === 'Member Not Found') {
        console.log(`Contact ${email} not found in Mailchimp - cannot update name`);
        throw new Error(`Contact not found in Mailchimp: ${email}`);
      }
      
      console.error('Error updating Mailchimp contact name:', error);
      throw error;
    }
  }

  /**
   * Add a new contact to Mailchimp audience
   * @param email User email
   * @param name User name
   * @param tipsAndGuidance Whether user wants tips and guidance
   * @param productUpdates Whether user wants product updates
   * @returns Result of the operation
   */
  async addContact(
    email: string, 
    name: string = '', 
    tipsAndGuidance: boolean = false, 
    productUpdates: boolean = false
  ): Promise<any> {
    if (!this._initialized) {
      throw new Error('Mailchimp service not initialized');
    }

    try {
      // Prepare tags based on user preferences
      const tags = [
        ...(tipsAndGuidance ? ['Tips, tricks and helpful guidance'] : []),
        ...(productUpdates ? ['Product updates and learning tips'] : []),
      ];

      // Split name into first and last name
      let firstName = name;
      let lastName = '';
      
      if (name && name.includes(' ')) {
        const nameParts = name.split(' ');
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ');
      }

      // Add the member to the list
      return await mailchimp.lists.addListMember(this._audienceId, {
        email_address: email,
        status: 'subscribed',
        merge_fields: {
          FNAME: firstName,
          LNAME: lastName
        },
        tags
      });
    } catch (error: any) {
      // Check if this is a "Member Exists" error, which is actually not an error for our use case
      if (error.response && error.response.body && error.response.body.title === 'Member Exists') {
        console.log(`Contact ${email} already exists in Mailchimp - this is not an error`);
        
        // Return a success response with the member exists info
        return {
          status: 'subscribed',
          email_address: email,
          already_exists: true,
          detail: error.response.body.detail
        };
      }
      
      // For any other error, log and rethrow
      console.error('Error adding contact to Mailchimp:', error);
      throw error;
    }
  }
}

// Create and export a singleton instance
const mailchimpService = new MailchimpService();
export default mailchimpService;
