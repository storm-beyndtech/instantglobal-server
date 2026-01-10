import axios, { AxiosInstance } from "axios";

interface AmadeusConfig {
  apiKey: string;
  apiSecret: string;
  apiUrl: string;
}

interface FlightSearchParams {
  origin: string;
  destination: string;
  departureDate: string;
  adults?: number;
  travelClass?: "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST";
  nonStop?: boolean;
  maxResults?: number;
}

interface FlightOffer {
  id: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  carrier: string;
  carrierCode: string;
  flightNumber: string;
  price: number;
  currency: string;
  numberOfStops: number;
  travelClass: string;
  availableSeats: number;
}

class AmadeusService {
  private config: AmadeusConfig;
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    this.config = {
      apiKey: process.env.AMADEUS_API_KEY || "",
      apiSecret: process.env.AMADEUS_API_SECRET || "",
      apiUrl: process.env.AMADEUS_API_URL || "https://test.api.amadeus.com",
    };

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      timeout: 30000,
    });

    // Check if credentials are configured
    if (!this.config.apiKey || !this.config.apiSecret) {
      console.warn("⚠️ Amadeus API credentials not configured. Flight search will use fallback data.");
    }
  }

  /**
   * Get OAuth access token
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    const now = Date.now();
    if (this.accessToken && this.tokenExpiresAt > now) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(
        `${this.config.apiUrl}/v1/security/oauth2/token`,
        new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.config.apiKey,
          client_secret: this.config.apiSecret,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      this.accessToken = response.data.access_token;
      // Set expiry to 5 minutes before actual expiry for safety
      this.tokenExpiresAt = now + (response.data.expires_in - 300) * 1000;

      console.log("✓ Amadeus access token obtained");
      return this.accessToken!;
    } catch (error: any) {
      console.error("❌ Failed to get Amadeus access token:", error.message);
      throw new Error("Failed to authenticate with Amadeus API");
    }
  }

  /**
   * Search for flights
   */
  async searchFlights(params: FlightSearchParams): Promise<FlightOffer[]> {
    // If API not configured, return mock data
    if (!this.config.apiKey || !this.config.apiSecret) {
      return this.getMockFlights(params);
    }

    try {
      const token = await this.getAccessToken();

      const response = await this.client.get("/v2/shopping/flight-offers", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          originLocationCode: params.origin,
          destinationLocationCode: params.destination,
          departureDate: params.departureDate,
          adults: params.adults || 1,
          travelClass: params.travelClass || "ECONOMY",
          nonStop: params.nonStop || false,
          max: params.maxResults || 10,
          currencyCode: "USD",
        },
      });

      const offers = response.data.data;
      const dictionaries = response.data.dictionaries;

      // Transform Amadeus response to our format
      return offers.slice(0, params.maxResults || 10).map((offer: any) => {
        const segment = offer.itineraries[0].segments[0];
        const carrier = dictionaries.carriers[segment.carrierCode];

        return {
          id: offer.id,
          origin: params.origin,
          destination: params.destination,
          departureTime: segment.departure.at,
          arrivalTime: segment.arrival.at,
          duration: offer.itineraries[0].duration,
          carrier: carrier || segment.carrierCode,
          carrierCode: segment.carrierCode,
          flightNumber: segment.number,
          price: parseFloat(offer.price.total),
          currency: offer.price.currency,
          numberOfStops: offer.itineraries[0].segments.length - 1,
          travelClass: params.travelClass || "ECONOMY",
          availableSeats: offer.numberOfBookableSeats || 9,
        };
      });
    } catch (error: any) {
      console.error("❌ Amadeus flight search error:", error.message);

      // Fallback to mock data on error
      console.log("⚠️ Using mock flight data as fallback");
      return this.getMockFlights(params);
    }
  }

  /**
   * Get flight price confirmation
   */
  async confirmFlightPrice(offerId: string): Promise<any> {
    if (!this.config.apiKey || !this.config.apiSecret) {
      throw new Error("Amadeus API not configured");
    }

    try {
      const token = await this.getAccessToken();

      const response = await this.client.post(
        "/v1/shopping/flight-offers/pricing",
        {
          data: {
            type: "flight-offers-pricing",
            flightOffers: [{ id: offerId }],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      return response.data.data;
    } catch (error: any) {
      console.error("❌ Amadeus price confirmation error:", error.message);
      throw new Error("Failed to confirm flight price");
    }
  }

  /**
   * Mock flight data for when API is not configured or fails
   */
  private getMockFlights(params: FlightSearchParams): FlightOffer[] {
    const basePrice = 250 + Math.random() * 500;

    return [
      {
        id: `mock_${Date.now()}_1`,
        origin: params.origin,
        destination: params.destination,
        departureTime: new Date(params.departureDate + "T10:00:00").toISOString(),
        arrivalTime: new Date(params.departureDate + "T14:30:00").toISOString(),
        duration: "PT4H30M",
        carrier: "United Airlines",
        carrierCode: "UA",
        flightNumber: "1234",
        price: Math.round(basePrice * 100) / 100,
        currency: "USD",
        numberOfStops: 0,
        travelClass: params.travelClass || "ECONOMY",
        availableSeats: 9,
      },
      {
        id: `mock_${Date.now()}_2`,
        origin: params.origin,
        destination: params.destination,
        departureTime: new Date(params.departureDate + "T15:30:00").toISOString(),
        arrivalTime: new Date(params.departureDate + "T20:15:00").toISOString(),
        duration: "PT4H45M",
        carrier: "Delta Air Lines",
        carrierCode: "DL",
        flightNumber: "5678",
        price: Math.round((basePrice + 50) * 100) / 100,
        currency: "USD",
        numberOfStops: 0,
        travelClass: params.travelClass || "ECONOMY",
        availableSeats: 7,
      },
      {
        id: `mock_${Date.now()}_3`,
        origin: params.origin,
        destination: params.destination,
        departureTime: new Date(params.departureDate + "T08:00:00").toISOString(),
        arrivalTime: new Date(params.departureDate + "T15:30:00").toISOString(),
        duration: "PT7H30M",
        carrier: "American Airlines",
        carrierCode: "AA",
        flightNumber: "9012",
        price: Math.round((basePrice - 80) * 100) / 100,
        currency: "USD",
        numberOfStops: 1,
        travelClass: params.travelClass || "ECONOMY",
        availableSeats: 12,
      },
    ];
  }

  /**
   * Check if API is configured
   */
  isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.apiSecret);
  }
}

// Export singleton instance
export default new AmadeusService();
