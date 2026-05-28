import { NextRequest, NextResponse } from 'next/server';

const BSD_API_KEY = process.env.BSD_API_KEY || '';
const BSD_BASE_URL = process.env.BSD_API_BASE_URL || 'https://sports.bzzoiro.com/api/v2/';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const endpoint = searchParams.get('endpoint');

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Missing required parameter: endpoint' },
        { status: 400 }
      );
    }

    // Build the BSD API URL
    const url = new URL(endpoint, BSD_BASE_URL);

    // Forward all other query params except 'endpoint'
    searchParams.forEach((value, key) => {
      if (key !== 'endpoint') {
        url.searchParams.append(key, value);
      }
    });

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Token ${BSD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`BSD API error: ${response.status} - ${errorText}`);
      return NextResponse.json(
        { error: `BSD API returned ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Football API proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
