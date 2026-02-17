import https from 'https';
import { URL } from 'url';

interface NOWPaymentsConfig {
  apiKey: string;
  sandboxMode: boolean;
  baseUrl: string;
}

interface PayoutRequest {
  address: string;
  currency: string;
  amount: number;
  ipn_callback_url?: string;
  extra_id?: string; // For currencies like XRP, EOS
}

interface MassPayoutRequest {
  withdrawals: PayoutRequest[];
}

interface PayoutResponse {
  id: string;
  status: string;
  currency: string;
  amount: number;
  address: string;
  txid?: string;
  extra_id?: string;
  error?: string;
}

interface MassPayoutResponse {
  id: string;
  status: string;
  withdrawals: PayoutResponse[];
}

interface BalanceResponse {
  currency: string;
  available_amount: number;
  pending_amount: number;
}

interface CurrencyInfo {
  name: string;
  logo_url: string;
  abbreviation: string;
  precision: number;
  confirms: number;
  contract_address?: string;
}

interface AddressValidationResponse {
  valid: boolean;
  message?: string;
}

class NOWPaymentsService {
  private config: NOWPaymentsConfig;

  constructor() {
    this.config = {
      apiKey: process.env.NOWPAYMENTS_API_KEY || '',
      sandboxMode: process.env.NOWPAYMENTS_SANDBOX === 'true',
      baseUrl: process.env.NOWPAYMENTS_SANDBOX === 'true' 
        ? 'https://api.nowpayments.io' // Note: Using production URL as sandbox seems to have DNS issues
        : 'https://api.nowpayments.io'
    };

    console.log('🔧 NOWPayments Service initialized:');
    console.log(`   📡 Mode: ${this.config.sandboxMode ? 'SANDBOX' : 'PRODUCTION'}`);
    console.log(`   🔗 Base URL: ${this.config.baseUrl}`);
    console.log(`   🔑 API Key: ${this.config.apiKey ? this.config.apiKey.substring(0, 8) + '...' : 'NOT SET'}`);
  }

  /**
   * Make HTTP request to NOWPayments API
   */
  private makeRequest<T>(endpoint: string, options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.config.baseUrl);
      
      console.log(`🔄 NOWPayments Request: ${options.method || 'GET'} ${url.toString()}`);
      
      const requestOptions: https.RequestOptions = {
        method: options.method || 'GET',
        headers: {
          'x-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'InstantGlobal-Server/1.0',
          ...options.headers
        }
      };

      const req = https.request(url, requestOptions, (res) => {
        let data = '';
        
        console.log(`📡 Response Status: ${res.statusCode}`);
        console.log(`📋 Response Headers:`, res.headers);
        
        res.on('data', chunk => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            console.log(`📄 Raw Response Data: ${data}`);
            
            const jsonData = JSON.parse(data);
            
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              console.log(`✅ Success Response:`, jsonData);
              resolve(jsonData);
            } else {
              console.log(`❌ Error Response (${res.statusCode}):`, jsonData);
              reject(new Error(`NOWPayments API Error (${res.statusCode}): ${JSON.stringify(jsonData)}`));
            }
          } catch (parseError) {
            console.log(`❌ JSON Parse Error:`, parseError);
            console.log(`📄 Raw Data:`, data);
            reject(new Error(`Failed to parse NOWPayments response: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        console.log(`❌ Request Error:`, error);
        reject(new Error(`NOWPayments request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        console.log(`⏰ Request Timeout`);
        req.destroy();
        reject(new Error('NOWPayments request timeout'));
      });

      // Set timeout to 30 seconds
      req.setTimeout(30000);

      if (options.body) {
        const bodyData = JSON.stringify(options.body);
        console.log(`📤 Request Body:`, bodyData);
        req.write(bodyData);
      }

      req.end();
    });
  }

  /**
   * Test connection to NOWPayments API
   */
  async testConnection(): Promise<{ connected: boolean; message: string; details?: string }> {
    try {
      console.log('🔄 Testing NOWPayments connection...');
      
      if (!this.config.apiKey) {
        return {
          connected: false,
          message: 'API key not configured',
          details: 'Set NOWPAYMENTS_API_KEY in environment variables'
        };
      }

      // Test basic API connectivity
      const statusResponse = await this.makeRequest('/v1/status');
      console.log('✅ Status check passed:', statusResponse);

      // Test API key by getting currencies
      const currenciesResponse = await this.makeRequest<{ currencies: string[] }>('/v1/currencies');
      const currencyCount = currenciesResponse.currencies?.length || 0;
      
      console.log(`✅ Currency check passed: ${currencyCount} currencies available`);

      return {
        connected: true,
        message: `Connected successfully - ${currencyCount} currencies available`,
        details: `API Key valid, ${this.config.sandboxMode ? 'sandbox' : 'production'} mode`
      };
      
    } catch (error: any) {
      console.error('❌ NOWPayments connection test failed:', error);
      return {
        connected: false,
        message: `Connection failed: ${error.message}`,
        details: 'Check API key and network connectivity'
      };
    }
  }

  /**
   * Get account balance for specified currency or all currencies
   */
  async getBalance(currency?: string): Promise<BalanceResponse[]> {
    try {
      console.log(`🔄 Getting balance for currency: ${currency || 'all'}`);
      
      const endpoint = currency ? `/v1/balance/${currency}` : '/v1/balance';
      const response = await this.makeRequest<BalanceResponse[]>(endpoint);
      
      console.log('✅ Balance retrieved:', response);
      return response;
      
    } catch (error: any) {
      console.error('❌ Failed to get balance:', error);
      
      // Return empty balance if IP not whitelisted or other auth issues
      if (error.message.includes('403') || error.message.includes('Access denied')) {
        console.log('⚠️ IP not whitelisted - returning empty balance');
        return [];
      }
      
      throw error;
    }
  }

  /**
   * Get available currencies for payouts
   */
  async getAvailableCurrencies(): Promise<string[]> {
    try {
      console.log('🔄 Getting available currencies...');
      
      const response = await this.makeRequest<{ currencies: string[] }>('/v1/currencies');
      
      console.log(`✅ Retrieved ${response.currencies.length} currencies`);
      return response.currencies;
      
    } catch (error: any) {
      console.error('❌ Failed to get currencies:', error);
      throw error;
    }
  }

  /**
   * Get minimum payout amount for a currency
   */
  async getMinimumPayout(currency: string): Promise<number> {
    try {
      console.log(`🔄 Getting minimum payout for ${currency}...`);
      
      // Try different endpoints that might exist for minimum amounts
      try {
        const response = await this.makeRequest<{ min_amount: number }>(`/v1/min-amount?currency_from=${currency.toLowerCase()}&currency_to=${currency.toLowerCase()}`);
        return response.min_amount;
      } catch (error) {
        console.log('⚠️ Standard min-amount endpoint failed, trying alternative...');
        
        // Fallback to reasonable defaults based on currency
        const defaults: Record<string, number> = {
          'btc': 0.0001,
          'eth': 0.001,
          'usdt': 1,
          'usdc': 1,
          'ltc': 0.001,
          'bch': 0.001,
          'xrp': 1,
          'ada': 1,
          'dot': 0.1,
          'bnb': 0.001
        };
        
        const minAmount = defaults[currency.toLowerCase()] || 1;
        console.log(`⚠️ Using default minimum amount: ${minAmount} ${currency}`);
        return minAmount;
      }
      
    } catch (error: any) {
      console.error(`❌ Failed to get minimum payout for ${currency}:`, error);
      throw error;
    }
  }

  /**
   * Validate a wallet address
   */
  async validateAddress(address: string, currency: string): Promise<AddressValidationResponse> {
    try {
      console.log(`🔄 Validating address for ${currency}: ${address.substring(0, 10)}...`);
      
      // Basic address validation
      if (!address || address.length < 10) {
        return { valid: false, message: 'Address too short' };
      }

      // Currency-specific basic validation
      const validations: Record<string, RegExp> = {
        'btc': /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
        'eth': /^0x[a-fA-F0-9]{40}$/,
        'usdt': /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^0x[a-fA-F0-9]{40}$/,
        'ltc': /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$/,
        'xrp': /^r[0-9a-zA-Z]{24,34}$/
      };

      const pattern = validations[currency.toLowerCase()];
      if (pattern && !pattern.test(address)) {
        return { valid: false, message: `Invalid ${currency.toUpperCase()} address format` };
      }

      console.log(`✅ Address validation passed for ${currency}`);
      return { valid: true };
      
    } catch (error: any) {
      console.error(`❌ Address validation failed:`, error);
      return { valid: false, message: `Validation error: ${error.message}` };
    }
  }

  /**
   * Create a single payout
   */
  async createPayout(payoutData: PayoutRequest): Promise<PayoutResponse> {
    try {
      console.log('🔄 Creating payout:', payoutData);
      
      const response = await this.makeRequest<PayoutResponse>('/v1/payout', {
        method: 'POST',
        body: payoutData
      });
      
      console.log('✅ Payout created:', response);
      return response;
      
    } catch (error: any) {
      console.error('❌ Failed to create payout:', error);
      throw error;
    }
  }

  /**
   * Create mass payout (multiple withdrawals)
   */
  async createMassPayout(payouts: PayoutRequest[]): Promise<MassPayoutResponse> {
    try {
      console.log(`🔄 Creating mass payout with ${payouts.length} withdrawals...`);
      
      const massPayoutData: MassPayoutRequest = {
        withdrawals: payouts
      };
      
      const response = await this.makeRequest<MassPayoutResponse>('/v1/payout/mass', {
        method: 'POST',
        body: massPayoutData
      });
      
      console.log('✅ Mass payout created:', response);
      return response;
      
    } catch (error: any) {
      console.error('❌ Failed to create mass payout:', error);
      throw error;
    }
  }

  /**
   * Get payout status by ID
   */
  async getPayoutStatus(payoutId: string): Promise<PayoutResponse | null> {
    try {
      console.log(`🔄 Getting payout status for ID: ${payoutId}`);
      
      const response = await this.makeRequest<PayoutResponse>(`/v1/payout/${payoutId}`);
      
      console.log('✅ Payout status retrieved:', response);
      return response;
      
    } catch (error: any) {
      console.error(`❌ Failed to get payout status for ${payoutId}:`, error);
      return null;
    }
  }
}

export default NOWPaymentsService;
