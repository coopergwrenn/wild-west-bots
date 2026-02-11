import { NextRequest, NextResponse } from 'next/server'

const TEMPLATES = [
  { title: 'Research competitor landscape', description: 'Analyze the top 10 competitors in [industry]. For each, provide: company name, key product, pricing model, target audience, strengths, and weaknesses. Deliver as a structured comparison table with a 1-paragraph summary of market gaps.', categories: ['research', 'analysis'], suggestedPrice: '2.00' },
  { title: 'Write a technical blog post', description: 'Write a 1500-word technical blog post about [topic]. Include code examples where relevant, explain concepts clearly for intermediate developers, and end with actionable next steps. SEO-optimized with meta description.', categories: ['writing'], suggestedPrice: '5.00' },
  { title: 'Analyze dataset and produce report', description: 'Take the provided CSV dataset and produce: summary statistics, 3 key insights, trend analysis, and 2 actionable recommendations. Deliver as a formatted report with data visualizations described.', categories: ['data', 'analysis'], suggestedPrice: '3.00' },
  { title: 'Build a landing page component', description: 'Create a responsive React component for a landing page hero section. Include: headline, subtext, CTA button, and background gradient. Use Tailwind CSS. Must work at 375px, 768px, and 1440px widths.', categories: ['coding', 'design'], suggestedPrice: '4.00' },
  { title: 'Design a logo concept', description: 'Create 3 logo concept descriptions for [brand name]. Each concept should include: visual description, color palette (hex codes), font suggestions, and rationale for why it fits the brand identity.', categories: ['design'], suggestedPrice: '3.00' },
  { title: 'Write API documentation', description: 'Document the provided API endpoints. For each endpoint: method, URL, request parameters, response format, example request/response, error codes, and authentication requirements.', categories: ['writing', 'coding'], suggestedPrice: '4.00' },
  { title: 'Create a market analysis brief', description: 'Produce a 2-page market analysis for [market/industry]. Cover: market size, growth rate, key players, emerging trends, regulatory factors, and investment opportunities.', categories: ['research', 'analysis'], suggestedPrice: '5.00' },
  { title: 'Write social media copy pack', description: 'Create 10 social media posts for [brand/product]. Include: 5 Twitter/X posts (280 chars max), 3 LinkedIn posts, 2 Instagram captions. Each with relevant hashtag suggestions.', categories: ['writing'], suggestedPrice: '2.00' },
  { title: 'Debug and fix a code issue', description: 'Diagnose the bug described below and provide a fix. Include: root cause analysis, the fix (with code), explanation of why it works, and any potential side effects to watch for.', categories: ['coding'], suggestedPrice: '3.00' },
  { title: 'Create a data pipeline script', description: 'Write a Python script that: reads data from [source], transforms it according to [rules], handles errors gracefully, logs progress, and outputs to [destination format].', categories: ['coding', 'data'], suggestedPrice: '5.00' },
  { title: 'Summarize a research paper', description: 'Read the provided research paper and produce: a 200-word executive summary, key findings (bullet points), methodology critique, practical implications, and related work suggestions.', categories: ['research', 'writing'], suggestedPrice: '1.50' },
  { title: 'Write a product requirements doc', description: 'Create a PRD for [feature]. Include: problem statement, user stories, functional requirements, non-functional requirements, success metrics, and timeline estimate.', categories: ['writing', 'analysis'], suggestedPrice: '4.00' },
  { title: 'Perform SEO audit', description: 'Audit the provided website URL for SEO. Cover: page speed, meta tags, heading structure, mobile responsiveness, backlink profile, keyword optimization, and provide a prioritized fix list.', categories: ['research', 'analysis'], suggestedPrice: '3.00' },
  { title: 'Create a financial model', description: 'Build a simple financial projection for [business type]. Include: revenue model, cost structure, 12-month P&L forecast, break-even analysis, and key assumptions listed.', categories: ['analysis', 'data'], suggestedPrice: '5.00' },
  { title: 'Write email sequence', description: 'Create a 5-email drip campaign for [goal]. Each email needs: subject line, preview text, body copy, CTA, and send timing. Include A/B test suggestions for subject lines.', categories: ['writing'], suggestedPrice: '3.00' },
  { title: 'Build a REST API endpoint', description: 'Implement a REST API endpoint in [framework] that handles [operation]. Include: input validation, error handling, database query, response formatting, and basic tests.', categories: ['coding'], suggestedPrice: '4.00' },
  { title: 'Create a competitive pricing analysis', description: 'Research pricing for [product category] across 8+ competitors. Deliver: pricing table, feature comparison at each tier, value positioning analysis, and recommended pricing strategy.', categories: ['research', 'analysis'], suggestedPrice: '3.00' },
  { title: 'Write unit tests for existing code', description: 'Write comprehensive unit tests for the provided code module. Cover: happy path, edge cases, error conditions, and boundary values. Use [testing framework]. Aim for >90% coverage.', categories: ['coding'], suggestedPrice: '3.00' },
  { title: 'Create a brand style guide', description: 'Develop a mini brand style guide for [brand]. Include: color palette with hex codes, typography recommendations, voice and tone guidelines, logo usage rules, and 3 example applications.', categories: ['design', 'writing'], suggestedPrice: '4.00' },
  { title: 'Analyze user feedback data', description: 'Process the provided user feedback (reviews, surveys, support tickets). Deliver: sentiment analysis summary, top 5 themes, verbatim quotes for each theme, and prioritized action items.', categories: ['data', 'analysis'], suggestedPrice: '3.00' },
  { title: 'Write a whitepaper outline', description: 'Create a detailed whitepaper outline for [topic]. Include: executive summary draft, 6+ section headings with descriptions, key data points to include, and suggested visuals/charts.', categories: ['writing', 'research'], suggestedPrice: '2.50' },
  { title: 'Create a database schema', description: 'Design a database schema for [application]. Include: ER diagram description, table definitions, relationships, indexes, and migration SQL. Optimize for [read-heavy/write-heavy] workload.', categories: ['coding', 'data'], suggestedPrice: '4.00' },
]

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')

  let results = TEMPLATES
  if (category) {
    results = TEMPLATES.filter(t => t.categories.includes(category.toLowerCase()))
  }

  return NextResponse.json({ templates: results, total: results.length })
}
