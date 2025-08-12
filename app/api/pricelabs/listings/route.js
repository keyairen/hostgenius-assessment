export async function GET() {
    console.log('=== API Route Called ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('API Key configured:', !!process.env.PRICELABS_API_KEY);
    console.log('API Key length:', process.env.PRICELABS_API_KEY?.length || 0);
    
    try {
      const headers = {
        'X-API-Key': process.env.PRICELABS_API_KEY,
        'Content-Type': 'application/json',
      };
      
      console.log('Request headers:', {
        'X-API-Key': `${headers['X-API-Key']?.substring(0, 8)}...`,
        'Content-Type': headers['Content-Type']
      });
  
      const response = await fetch('https://api.pricelabs.co/v1/listings', {
        method: 'GET',
        headers: headers,
      });
  
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
  
      // Log rate limit headers if available
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      const rateLimitReset = response.headers.get('x-ratelimit-reset');
      const rateLimitLimit = response.headers.get('x-ratelimit-limit');
      
      console.log('Rate limit info:', {
        remaining: rateLimitRemaining,
        reset: rateLimitReset,
        limit: rateLimitLimit
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response body:', errorText);
        
        // Special handling for rate limit
        if (response.status === 429) {
          const resetTime = rateLimitReset ? new Date(rateLimitReset * 1000).toLocaleString() : 'unknown';
          return Response.json(
            { 
              error: 'Rate limit exceeded',
              message: `Too many requests. Rate limit resets at: ${resetTime}`,
              rateLimitRemaining: rateLimitRemaining || 0,
              rateLimitReset: rateLimitReset,
              errorDetails: errorText
            },
            { status: 429 }
          );
        }
        
        return Response.json(
          { 
            error: `PriceLabs API error: ${response.status} ${response.statusText}`,
            details: errorText
          },
          { status: response.status }
        );
      }
  
      const data = await response.json();
      console.log('Success! Data received, listings count:', data.listings?.length || 0);
      
      // Include rate limit info in successful responses
      const responseData = {
        ...data,
        _meta: {
          rateLimitRemaining: rateLimitRemaining || 'unknown',
          rateLimitReset: rateLimitReset ? new Date(rateLimitReset * 1000).toISOString() : 'unknown',
          rateLimitLimit: rateLimitLimit || 'unknown'
        }
      };
      
      return Response.json(responseData);
      
    } catch (error) {
      console.error('API Route error:', error);
      return Response.json(
        { 
          error: 'Internal server error', 
          message: error.message 
        },
        { status: 500 }
      );
    }
  }