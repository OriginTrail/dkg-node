---
description: >-
  Hackathon Guide with examples on how to interact with the provided example
  Hackathon Social Graph
---

# DKG Social Graph Query Guide

This is a  comprehensive guide for querying social graph data (tweets, Reddit posts, TikTok videos, news articles, etc.) on the OriginTrail Decentralized Knowledge Graph using SPARQL. This guide covers JSON-LD data structures, example queries, and available MCP/API tools for builders and AI agents.

**Server:** `https://euphoria.origin-trail.network`

***

### Table of Contents

1. Understanding JSON-LD Data Structures
   * Data Types Overview
   * Creator-Static Structure
   * Creator-Temporal Structure
   * Post-Static Structure
   * Post-Temporal Structure
   * Topic-Static Structure
   * Topic-Temporal Structure
2. Available Query Tools
   * MCP Tool (Model Context Protocol)
   * REST API
3. SPARQL Query Examples by Data Type
   * Querying Creator-Static Data
   * Querying Creator-Temporal Data
   * Querying Post-Static Data
   * Querying Post-Temporal Data
   * Querying Topic-Static Data
   * Querying Topic-Temporal Data
4. Advanced Query Scenarios
   * Scenario 1: Get Trending Topics with Engagement Metrics
   * Scenario 2: Find Most Engaging Content Types for a Topic
   * Scenario 3: Find Topics by Category
   * Scenario 4: Topic Sentiment Analysis Over Time
5. Supported SPARQL Query Types
   * SELECT Queries
   * CONSTRUCT Queries
   * ASK Queries
   * DESCRIBE Queries
6. Usage Examples
   * Example 1: cURL Request
   * Example 2: JavaScript/Node.js
   * Example 3: Python
7. Security & Validation
8. Error Handling
9. Query Optimization Tips
10. API Documentation
11. Support & Resources

***

### Understanding JSON-LD Data Structures

The DKG stores social media data as JSON-LD Knowledge Assets using standard vocabularies (Schema.org, FOAF, PROV, SIOC, SKOS). Data is organized into **static** (unchanging metadata) and **temporal** (time-series observations) formats.

#### Data Types Overview

| Type        | Static               | Temporal                                  | Description                          |
| ----------- | -------------------- | ----------------------------------------- | ------------------------------------ |
| **Creator** | Profile metadata     | Follower counts, connections over time    | Social media accounts and users      |
| **Post**    | Content, author, URL | Engagement metrics (views, likes, shares) | Social media posts, articles, videos |
| **Topic**   | Name, identifiers    | Rankings, sentiment, post counts          | Trending topics and hashtags         |

#### Creator-Static Structure

Represents a social media account's core identity:

```json
{
  "@context": {
    "schema": "https://schema.org/",
    "prov": "http://www.w3.org/ns/prov#",
    "foaf": "http://xmlns.com/foaf/0.1/"
  },
  "@graph": [
    {
      "@type": ["schema:Person", "foaf:Person", "prov:Agent"],
      "@id": "https://ca.investing.com",
      "schema:identifier": [
        {
          "@type": "schema:PropertyValue",
          "schema:propertyID": "creatorId",
          "schema:value": "news::ca.investing.com"
        },
        {
          "@type": "schema:PropertyValue",
          "schema:propertyID": "platform",
          "schema:value": "news"
        }
      ],
      "schema:dateCreated": "1970-01-21T09:19:38.440Z"
    }
  ]
}
```

#### Creator-Temporal Structure

Captures time-series data about account activity and connections:

```json
{
  "@context": {
    "schema": "https://schema.org/",
    "prov": "http://www.w3.org/ns/prov#",
    "foaf": "http://xmlns.com/foaf/0.1/"
  },
  "@graph": [
    {
      "@type": ["prov:Entity", "schema:Observation"],
      "@id": "urn:uuid:25499e5d-7c9a-53d7-85c6-acc1cdac6ba8",
      "prov:generatedAtTime": "1970-01-21T09:19:38.440Z",
      "schema:about": {
        "@id": "https://twitter.com/i/user/748244810692104192"
      },
      "foaf:knows": [
        {
          "@type": "foaf:Person",
          "@id": "https://x.com/9to5mac",
          "schema:name": "9to5mac",
          "schema:additionalProperty": {
            "@type": "schema:PropertyValue",
            "schema:name": "connectionStrength",
            "schema:value": 17
          }
        }
      ],
      "foaf:accountProfileInfo": {
        "@type": "schema:Person",
        "schema:name": "Ryan Christoffel",
        "schema:alternateName": "iryantldr",
        "schema:image": {
          "@type": "schema:ImageObject",
          "schema:url": "https://pbs.twimg.com/profile_images/..."
        }
      },
      "schema:interactionStatistic": [
        {
          "@type": "schema:InteractionCounter",
          "schema:interactionType": {"@type": "schema:FollowAction"},
          "schema:userInteractionCount": 208065784
        }
      ]
    }
  ]
}
```

#### Post-Static Structure

Core metadata about a social media post:

```json
{
  "@context": {
    "schema": "https://schema.org/",
    "sioc": "http://rdfs.org/sioc/ns#",
    "prov": "http://www.w3.org/ns/prov#"
  },
  "@graph": [
    {
      "@type": ["schema:SocialMediaPosting", "sioc:Post", "prov:Entity"],
      "@id": "https://247sports.com/college/notre-dame/article/...",
      "schema:author": [
        {"@id": "https://twitter.com/i/user/151595281"}
      ],
      "schema:identifier": {
        "@type": "schema:PropertyValue",
        "schema:propertyID": "postId",
        "schema:value": "247sports.com-1025526375"
      },
      "schema:datePublished": "1970-01-21T08:57:14.089Z",
      "schema:url": "https://247sports.com/...",
      "schema:genre": "news",
      "schema:headline": "Notre Dame Notebook: Irish Defense...",
      "schema:description": "Notre Dame's defense dominated...",
      "schema:keywords": "notre dame,north carolina",
      "schema:about": [
        {
          "@type": "schema:Thing",
          "@id": "https://lunarcrush.com/api4/public/topic/notre%20dame/v1"
        }
      ]
    }
  ]
}
```

#### Post-Temporal Structure

Engagement metrics tracked over time:

```json
{
  "@context": {
    "schema": "https://schema.org/",
    "prov": "http://www.w3.org/ns/prov#"
  },
  "@graph": [
    {
      "@type": ["prov:Entity", "schema:Observation"],
      "@id": "urn:uuid:de0e9046-5754-5a22-b5a9-1f3a520a846b",
      "prov:generatedAtTime": "1970-01-21T09:19:38.340Z",
      "schema:about": {
        "@id": "https://9to5mac.com/2025/10/16/i-love-my-iphone-air..."
      },
      "prov:specializationOf": {
        "@id": "https://9to5mac.com/2025/10/16/i-love-my-iphone-air..."
      },
      "schema:interactionStatistic": {
        "@type": "schema:InteractionCounter",
        "schema:interactionType": "schema:InteractAction",
        "schema:userInteractionCount": 35921,
        "schema:description": "Total interactions"
      },
      "schema:variableMeasured": [
        {
          "@type": "schema:PropertyValue",
          "schema:name": "detailedMetrics",
          "schema:value": "{\"views\":35744,\"quotes\":2,\"replies\":20,\"retweets\":5,\"bookmarks\":13,\"favorites\":137}"
        }
      ]
    }
  ]
}
```

#### Topic-Static Structure

Basic topic information:

```json
{
  "@context": {
    "schema": "https://schema.org/",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "skos": "http://www.w3.org/2004/02/skos/core#"
  },
  "@graph": [
    {
      "@type": ["schema:Thing", "skos:Concept", "foaf:Topic"],
      "@id": "https://lunarcrush.com/api4/public/topic/%240992hk/v1",
      "schema:name": "Lenovo Group Limited",
      "foaf:name": "Lenovo Group Limited",
      "schema:alternateName": "$0992hk",
      "skos:notation": "$0992hk",
      "schema:identifier": {
        "@type": "schema:PropertyValue",
        "schema:propertyID": "topicSlug",
        "schema:value": "$0992hk"
      }
    }
  ]
}
```

#### Topic-Temporal Structure

Topic trends, rankings, and sentiment over time:

```json
{
  "@context": {
    "schema": "https://schema.org/",
    "prov": "http://www.w3.org/ns/prov#"
  },
  "@graph": [
    {
      "@type": ["prov:Entity", "schema:Observation"],
      "@id": "urn:uuid:42422e77-aef8-5621-8350-5175e64b929b",
      "prov:generatedAtTime": "1970-01-21T09:19:53.508Z",
      "schema:about": {
        "@id": "https://lunarcrush.com/api4/public/topic/postgame/v1"
      },
      "schema:relatedLink": [
        {"@id": "https://lunarcrush.com/api4/public/topic/blue%20jays/v1"},
        {"@id": "https://lunarcrush.com/api4/public/topic/toronto/v1"}
      ],
      "schema:rank": 1223,
      "schema:additionalProperty": [
        {
          "@type": "schema:PropertyValue",
          "schema:name": "numContributors",
          "schema:value": 1762
        },
        {
          "@type": "schema:PropertyValue",
          "schema:name": "numPosts",
          "schema:value": 1762
        },
        {
          "@type": "schema:PropertyValue",
          "schema:name": "interactions24h",
          "schema:value": 16461825
        },
        {
          "@type": "schema:PropertyValue",
          "schema:name": "trend",
          "schema:value": "up"
        }
      ],
      "schema:variableMeasured": [
        {
          "@type": "schema:PropertyValue",
          "schema:name": "postTypeDistribution",
          "schema:value": "{\"news\":293,\"tweet\":17606,\"reddit-post\":10608}"
        },
        {
          "@type": "schema:PropertyValue",
          "schema:name": "sentimentByType",
          "schema:value": "{\"news\":74,\"tweet\":59,\"reddit-post\":18}"
        }
      ]
    }
  ]
}
```

***

### Available Query Tools

#### 1. MCP Tool (Model Context Protocol)

Connect to the MCP server to use the SPARQL query tool with your AI agent.

**MCP Server URL:** `https://euphoria.origin-trail.network/mcp`

**Tool Name:** `dkg-sparql-query`

**Description:** Execute SPARQL queries on the OriginTrail DKG to query social graph data. Supports read-only queries: SELECT, CONSTRUCT, ASK, and DESCRIBE.

**Input Parameter:**

* `query` (string, required): SPARQL query to execute

**MCP Configuration Example (for Adding the MCP server to Cursor, VS Code, etc.):**

```json
{
  "servers": {
    "dkg-social-graph": {
      "url": "https://euphoria.origin-trail.network/mcp",
      "type": "http"
    }
  }
}
```

**Response Format:** Returns formatted markdown text with query results in JSON format:

✅ Query executed successfully

**Results:**

```json
{
  "data": [
    {"s": "...", "p": "...", "o": "..."}
  ]
}
```

#### 2. REST API

Use the HTTP endpoint directly for integrations with your DKG Edge Node agent via MCP tools, scripts, or applications.

**Endpoint:**

POST https://euphoria.origin-trail.network/dkg-sparql-query

**Headers:**

Content-Type: application/json

**Request Body:**

```json
{
  "query": "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10"
}
```

**Response (Success):**

```json
{
  "success": true,
  "data": {
    "data": [
      {"s": "...", "p": "...", "o": "..."}
    ]
  }
}
```

**Response (Error):**

```json
{
  "success": false,
  "error": "Invalid SPARQL query: Query cannot be empty"
}
```

**HTTP Status Codes:**

* `200` - Query executed successfully
* `400` - Invalid query (validation error)
* `500` - Server error during query execution

***

### SPARQL Query Examples by Data Type

#### Querying Creator-Static Data

Retrieve social media account profile information:

```sparql
PREFIX schema: <https://schema.org/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?person ?userId ?creatorId ?platform ?dateCreated
WHERE {
  ?person a schema:Person ;
          a foaf:Person ;
          a prov:Agent .
  
  ?person schema:identifier ?platformId .
  ?platformId schema:propertyID "platform" ;
              schema:value ?platform .
  
  OPTIONAL {
    ?person schema:identifier ?userIdent .
    ?userIdent schema:propertyID "userId" ;
               schema:value ?userId .
  }
  
  OPTIONAL {
    ?person schema:identifier ?creatorIdent .
    ?creatorIdent schema:propertyID "creatorId" ;
                  schema:value ?creatorId .
  }
  
  OPTIONAL {
    ?person schema:dateCreated ?dateCreated .
  }
}
LIMIT 100
```

#### Querying Creator-Temporal Data

Get account observations including followers, connections, and profile details:

```sparql
PREFIX schema: <https://schema.org/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT 
  ?entity 
  ?generatedAtTime 
  ?observationDate 
  ?about 
  ?profileName
  ?profileAlternateName
  ?profileImageUrl
  (GROUP_CONCAT(DISTINCT CONCAT(?personName, ":", STR(?connectionStrength)); separator=", ") AS ?knownPersons)
  (GROUP_CONCAT(DISTINCT CONCAT(STRAFTER(STR(?interactionType), "https://schema.org/"), ":", STR(?interactionCount)); separator=", ") AS ?interactionStats)
WHERE {
  ?entity a schema:Observation, prov:Entity ;
          prov:generatedAtTime ?generatedAtTime ;
          schema:observationDate ?observationDate ;
          schema:about ?about ;
          prov:specializationOf ?specializationOf .
  
  OPTIONAL {
    ?entity foaf:accountProfileInfo ?profileId .
    ?profileId schema:name ?profileName ;
               schema:alternateName ?profileAlternateName .
    OPTIONAL {
      ?profileId schema:image [ schema:url ?profileImageUrl ] .
    }
  }

  OPTIONAL {
    ?entity foaf:knows ?person .
    ?person schema:name ?personName ;
            schema:additionalProperty [
              schema:name "connectionStrength" ;
              schema:value ?connectionStrength
            ] .
  }
  
  OPTIONAL {
    ?entity schema:interactionStatistic ?stat .
    ?stat a schema:InteractionCounter ;
          schema:interactionType [ a ?interactionType ] ;
          schema:userInteractionCount ?interactionCount .
  }
}
GROUP BY ?entity ?generatedAtTime ?observationDate ?about ?profileName ?profileAlternateName ?profileImageUrl
ORDER BY ?entity
LIMIT 100
```

#### Querying Post-Static Data

Retrieve social media posts with metadata:

```sparql
PREFIX schema: <https://schema.org/>
PREFIX sioc: <http://rdfs.org/sioc/ns#>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT
  ?post
  (GROUP_CONCAT(DISTINCT ?typeStr; separator=", ") AS ?types)
  (GROUP_CONCAT(DISTINCT STR(?author); separator=", ") AS ?authors)
  ?datePublished
  ?url
  ?genre
  ?headline
  ?description
  ?about
WHERE {
  ?post a schema:SocialMediaPosting, sioc:Post, prov:Entity ;
        schema:author ?author ;
        schema:datePublished ?datePublished ;
        schema:url ?url ;
        schema:genre ?genre ;
        schema:headline ?headline ;
        schema:description ?description .

  ?post a ?type .
  BIND(REPLACE(STR(?type), "(http://www.w3.org/ns/prov#|https://schema.org/|http://rdfs.org/sioc/ns#)", "") AS ?typeStr)

  OPTIONAL { ?post schema:about ?about . }
}
GROUP BY ?post ?datePublished ?url ?genre ?headline ?description ?about
ORDER BY DESC(?datePublished)
LIMIT 100
```

#### Querying Post-Temporal Data

Get engagement metrics for posts over time:

```sparql
PREFIX schema: <https://schema.org/>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT
  ?observationId
  ?generatedAtTime
  ?observationDate
  ?aboutId
  ?interactionCount
  ?interactionDescription
  (GROUP_CONCAT(DISTINCT ?metrics; separator=" | ") AS ?detailedMetrics)
WHERE {
  ?observationId a schema:Observation, prov:Entity .
  
  OPTIONAL { ?observationId prov:generatedAtTime ?generatedAtTime . }
  OPTIONAL { ?observationId schema:observationDate ?observationDate . }
  OPTIONAL { ?observationId schema:about ?aboutId . }

  OPTIONAL {
    ?observationId schema:interactionStatistic [
      a schema:InteractionCounter ;
      schema:userInteractionCount ?interactionCount ;
      schema:description ?interactionDescription
    ] .
  }

  OPTIONAL {
    ?observationId schema:variableMeasured [
      a schema:PropertyValue ;
      schema:name "detailedMetrics" ;
      schema:value ?metrics
    ] .
  }
}
GROUP BY ?observationId ?generatedAtTime ?observationDate ?aboutId ?interactionCount ?interactionDescription
ORDER BY DESC(?observationDate)
LIMIT 100
```

#### Querying Topic-Static Data

Retrieve topic metadata and identifiers:

```sparql
PREFIX schema: <https://schema.org/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT
  ?topicId
  (GROUP_CONCAT(DISTINCT ?typeStr; separator=", ") AS ?types)
  ?schemaName
  ?foafName
  ?alternateName
  ?notation
  ?topicSlug
WHERE {
  ?topicId a foaf:Topic .
  
  ?topicId a ?type .
  BIND(REPLACE(STR(?type), "(https://schema.org/|http://xmlns.com/foaf/0.1/|http://www.w3.org/2004/02/skos/core#)", "") AS ?typeStr)
  
  OPTIONAL { ?topicId schema:name ?schemaName . }
  OPTIONAL { ?topicId foaf:name ?foafName . }
  OPTIONAL { ?topicId schema:alternateName ?alternateName . }
  OPTIONAL { ?topicId skos:notation ?notation . }

  OPTIONAL {
    ?topicId schema:identifier [
      a schema:PropertyValue ;
      schema:propertyID "topicSlug" ;
      schema:value ?topicSlug
    ] .
  }
}
GROUP BY ?topicId ?schemaName ?foafName ?alternateName ?notation ?topicSlug
ORDER BY ?schemaName
LIMIT 100
```

#### Querying Topic-Temporal Data

Get topic trends, rankings, and engagement data:

```sparql
PREFIX schema: <https://schema.org/>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT
  ?observationId
  ?generatedAtTime
  ?observationDate
  ?aboutId
  ?rank
  (GROUP_CONCAT(DISTINCT STR(?relatedLink); separator=" | ") AS ?relatedLinks)
  (GROUP_CONCAT(DISTINCT CONCAT(?propName, ": ", STR(?propValue)); separator="; ") AS ?additionalProperties)
  (GROUP_CONCAT(DISTINCT CONCAT(?metricName, ": ", ?metricValue); separator="; ") AS ?measuredVariables)
WHERE {
  ?observationId a schema:Observation .
  
  OPTIONAL { ?observationId prov:generatedAtTime ?generatedAtTime . }
  OPTIONAL { ?observationId schema:observationDate ?observationDate . }
  OPTIONAL { ?observationId schema:about ?aboutId . }
  OPTIONAL { ?observationId schema:rank ?rank . }
  OPTIONAL { ?observationId schema:relatedLink ?relatedLink . }

  OPTIONAL {
    ?observationId schema:additionalProperty [
      a schema:PropertyValue ;
      schema:name ?propName ;
      schema:value ?propValue
    ] .
  }
  
  OPTIONAL {
    ?observationId schema:variableMeasured [
      a schema:PropertyValue ;
      schema:name ?metricName ;
      schema:value ?metricValue
    ] .
  }
}
GROUP BY ?observationId ?generatedAtTime ?observationDate ?aboutId ?rank
ORDER BY ?rank
LIMIT 100
```

***

### Advanced Query Scenarios

#### Scenario 1: Get Trending Topics with Engagement Metrics

Find top 10 trending topics with contributor counts, post volumes, and trend direction:

```sparql
PREFIX schema: <https://schema.org/>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?topic ?topicName ?rank ?contributors ?posts ?interactions ?trend
WHERE {
  ?snapshot a prov:Entity ;
            prov:specializationOf ?topicId ;
            schema:rank ?rank .
  
  ?topicId a schema:Thing ;
           schema:name ?topicName .
  
  ?snapshot schema:additionalProperty ?contributorsProp .
  ?contributorsProp schema:name "numContributors" ;
                    schema:value ?contributors .
  
  ?snapshot schema:additionalProperty ?postsProp .
  ?postsProp schema:name "numPosts" ;
             schema:value ?posts .
  
  ?snapshot schema:additionalProperty ?interactionsProp .
  ?interactionsProp schema:name "interactions24h" ;
                    schema:value ?interactions .
  
  ?snapshot schema:additionalProperty ?trendProp .
  ?trendProp schema:name "trend" ;
             schema:value ?trend .
  
  FILTER(?rank <= 10)
  
  BIND(?topicId AS ?topic)
}
ORDER BY ?rank
```

**Use Case:** Content strategists planning social media campaigns based on trending topics.

#### Scenario 2: Find Most Engaging Content Types for a Topic

Analyze which content types (tweets, videos, news) generate the most engagement:

```sparql
PREFIX schema: <https://schema.org/>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?contentType (COUNT(?post) AS ?postCount) (AVG(?interactions) AS ?avgInteractions)
WHERE {
  # Find posts about "youtube" topic
  ?post a schema:SocialMediaPosting ;
        schema:about <https://lunarcrush.com/api4/public/topic/youtube/v1> ;
        schema:genre ?contentType .
  
  # Get engagement metrics
  ?observation a schema:Observation ;
               prov:specializationOf ?post ;
               schema:interactionStatistic ?stat .
  
  ?stat schema:description "Total interactions" ;
        schema:userInteractionCount ?interactions .
}
GROUP BY ?contentType
ORDER BY DESC(?avgInteractions)
```

**Use Case:** Marketers optimizing content format mix for specific topics.

#### Scenario 3: Find Topics by Category

Discover all topics in a specific category (e.g., gaming):

```sparql
PREFIX schema: <https://schema.org/>

SELECT DISTINCT ?topic ?topicName ?category
WHERE {
  ?topic a schema:Thing ;
         schema:name ?topicName .
  
  ?snapshot schema:about ?topic ;
            schema:category ?category .
  
  FILTER(CONTAINS(LCASE(?category), "gaming"))
}
```

**Use Case:** Content curators building category-specific feeds.

#### Scenario 4: Topic Sentiment Analysis Over Time

Track sentiment changes for a topic correlated with events:

```sparql
PREFIX schema: <https://schema.org/>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?datePublished (AVG(?sentiment) AS ?avgSentiment) (COUNT(?post) AS ?postCount)
WHERE {
  ?post a schema:SocialMediaPosting ;
        schema:about <https://lunarcrush.com/api4/public/topic/bitcoin/v1> ;
        schema:datePublished ?datePublished .
  
  ?observation a schema:Observation ;
               prov:specializationOf ?post ;
               schema:reviewRating [ schema:ratingValue ?sentiment ] .
}
GROUP BY ?datePublished
ORDER BY ?datePublished
```

**Use Case:** Sentiment analysts tracking public opinion trends.

### Supported SPARQL Query Types

The DKG SPARQL endpoint supports read-only query operations:

#### SELECT Queries

Retrieve specific data fields matching patterns.

**Example - Get Top Posts:**

```sparql
PREFIX schema: <https://schema.org/>
SELECT ?headline ?url ?datePublished
WHERE {
  ?post a schema:SocialMediaPosting ;
        schema:headline ?headline ;
        schema:url ?url ;
        schema:datePublished ?datePublished .
}
ORDER BY DESC(?datePublished)
LIMIT 20
```

**Returns:** Array of result bindings

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "headline": "Breaking News...",
        "url": "https://example.com/article",
        "datePublished": "2025-11-14T12:00:00Z"
      }
    ]
  }
}
```

#### CONSTRUCT Queries

Build new RDF graphs from query patterns.

**Example - Extract Topic Network:**

```sparql
PREFIX schema: <https://schema.org/>
CONSTRUCT {
  ?topic schema:name ?name .
  ?topic schema:relatedLink ?related .
}
WHERE {
  ?observation schema:about ?topic ;
               schema:relatedLink ?related .
  ?topic schema:name ?name .
}
LIMIT 50
```

**Returns:** RDF triples as N-Triples string

```json
{
  "success": true,
  "data": {
    "data": "<https://lunarcrush.com/.../topic/bitcoin/v1> <https://schema.org/name> \"Bitcoin\" .\n..."
  }
}
```

#### ASK Queries

Boolean pattern existence checks.

**Example - Check if Topic Exists:**

```sparql
PREFIX schema: <https://schema.org/>
ASK WHERE {
  ?topic a schema:Thing ;
         schema:name "Bitcoin" .
}
```

**Returns:** Boolean

```json
{
  "success": true,
  "data": {
    "data": true
  }
}
```

#### DESCRIBE Queries

Retrieve all triples about a resource.

**Example - Get Complete Topic Info:**

```sparql
DESCRIBE <https://lunarcrush.com/api4/public/topic/bitcoin/v1>
```

**Returns:** All predicates and objects for the subject

***

### Security & Validation

#### Allowed Operations

✅ **SELECT** - Query and retrieve data\
✅ **CONSTRUCT** - Generate RDF graphs\
✅ **ASK** - Boolean pattern matching\
✅ **DESCRIBE** - Resource description

#### Blocked Operations

❌ **INSERT** - Write operations not permitted\
❌ **DELETE** - Write operations not permitted\
❌ **UPDATE** - Modification operations not permitted

#### Validation Rules

* Query cannot be empty
* Must be valid SPARQL syntax
* SELECT and CONSTRUCT queries require WHERE clauses
* Only read-only query types accepted

***

### Usage Examples

#### Example 1: cURL Request - Query Trending Topics

```bash
curl -X POST https://euphoria.origin-trail.network/dkg-sparql-query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "PREFIX schema: <https://schema.org/>\nPREFIX prov: <http://www.w3.org/ns/prov#>\n\nSELECT ?topicName ?rank ?interactions\nWHERE {\n  ?snapshot a prov:Entity ;\n            prov:specializationOf ?topicId ;\n            schema:rank ?rank .\n  \n  ?topicId schema:name ?topicName .\n  \n  ?snapshot schema:additionalProperty ?interactionsProp .\n  ?interactionsProp schema:name \"interactions24h\" ;\n                    schema:value ?interactions .\n  \n  FILTER(?rank <= 10)\n}\nORDER BY ?rank"
  }'
```

#### Example 2: JavaScript/Node.js - Find Posts by Topic

```javascript
const response = await fetch('https://euphoria.origin-trail.network/dkg-sparql-query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `
      PREFIX schema: <https://schema.org/>
      PREFIX sioc: <http://rdfs.org/sioc/ns#>
      
      SELECT ?post ?headline ?datePublished ?url
      WHERE {
        ?post a schema:SocialMediaPosting ;
              schema:headline ?headline ;
              schema:datePublished ?datePublished ;
              schema:url ?url ;
              schema:about <https://lunarcrush.com/api4/public/topic/blockchain/v1> .
      }
      ORDER BY DESC(?datePublished)
      LIMIT 10
    `
  })
});

const result = await response.json();
if (result.success) {
  console.log('Found posts:', result.data.data.length);
  result.data.data.forEach(post => {
    console.log(`${post.headline} - ${post.datePublished}`);
  });
}
```

#### Example 3: Python - Analyze Content Type Performance

```python
import requests
import json

url = "https://euphoria.origin-trail.network/dkg-sparql-query"
query = """
PREFIX schema: <https://schema.org/>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT ?contentType (COUNT(?post) AS ?postCount) (AVG(?interactions) AS ?avgInteractions)
WHERE {
  ?post a schema:SocialMediaPosting ;
        schema:genre ?contentType .
  
  ?observation a schema:Observation ;
               prov:specializationOf ?post ;
               schema:interactionStatistic ?stat .
  
  ?stat schema:userInteractionCount ?interactions .
}
GROUP BY ?contentType
ORDER BY DESC(?avgInteractions)
LIMIT 5
"""

response = requests.post(url, json={"query": query})
result = response.json()

if result['success']:
    print(f"Content Type Analysis:")
    for row in result['data']['data']:
        print(f"  {row['contentType']}: {row['postCount']} posts, avg {row['avgInteractions']} interactions")
else:
    print(f"Error: {result['error']}")
```

### Error Handling

#### Validation Errors (HTTP 400)

**Empty Query:**

```json
{
  "success": false,
  "error": "Invalid SPARQL query: Query cannot be empty"
}
```

**Missing WHERE Clause:**

```json
{
  "success": false,
  "error": "Invalid SPARQL query: Invalid SPARQL syntax: Parse error on line 1..."
}
```

**Write Operation Blocked:**

```json
{
  "success": false,
  "error": "Invalid SPARQL query: Only SPARQL queries are allowed, not updates (INSERT, DELETE, MODIFY)"
}
```

#### Execution Errors (HTTP 500)

**Single Node Error:**

```json
{
  "success": false,
  "error": "Connection timeout to DKG node",
}
```

**Both Nodes Failed:**

```json
{
  "success": false,
  "error": "Both nodes failed. Primary: [error message]. Fallback: [error message]"
}
```

### Query Optimization Tips

1.  **Use LIMIT clauses** - Prevent retrieving large datasets

    ```sparql
    SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 100
    ```
2.  **Filter early** - Apply FILTER conditions to reduce data processing

    ```sparql
    SELECT ?post ?headline WHERE {
      ?post schema:headline ?headline .
      FILTER(CONTAINS(LCASE(?headline), "bitcoin"))
    }
    ```
3.  **Be specific with properties** - Query only the fields you need

    ```sparql
    SELECT ?name ?datePublished WHERE {
      ?s schema:name ?name ;
         schema:datePublished ?datePublished .
    }
    ```
4.  **Use OPTIONAL wisely** - Avoid excessive OPTIONAL clauses that slow queries

    ```sparql
    SELECT ?post ?headline WHERE {
      ?post a schema:SocialMediaPosting ;
            schema:headline ?headline .
      OPTIONAL { ?post schema:author ?author }  # Only if needed
    }
    ```
5.  **Leverage aggregations** - Use GROUP BY with aggregate functions for analytics

    ```sparql
    SELECT ?genre (COUNT(?post) AS ?count) (AVG(?interactions) AS ?avgEngagement)
    WHERE {
      ?post schema:genre ?genre .
      ?observation prov:specializationOf ?post ;
                   schema:interactionStatistic [ schema:userInteractionCount ?interactions ] .
    }
    GROUP BY ?genre
    ```
6.  **Use prefixes** - Make queries more readable and maintainable

    ```sparql
    PREFIX schema: <https://schema.org/>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    SELECT ?s WHERE { ?s a schema:SocialMediaPosting }
    ```
7.  **Filter by date ranges** - Restrict temporal queries to relevant time periods

    ```sparql
    SELECT ?post ?date WHERE {
      ?post schema:datePublished ?date .
      FILTER(?date >= "2025-01-01T00:00:00Z"^^xsd:dateTime)
    }
    ```
8.  **Use specific URIs when known** - Direct URI references are faster than patterns

    ```sparql
    SELECT ?prop ?value WHERE {
      <https://lunarcrush.com/api4/public/topic/bitcoin/v1> ?prop ?value .
    }
    ```

***

### API Documentation

Interactive API documentation is available via Swagger UI:

**Swagger URL:** `https://euphoria.origin-trail.network/swagger`

Browse all available endpoints, test queries interactively, and view detailed schemas.

### Support & Resources

* **DKG Documentation:** [docs.origintrail.io](https://docs.origintrail.io)
* **SPARQL Tutorial:** [www.w3.org/TR/sparql11-query/](https://www.w3.org/TR/sparql11-query/)

