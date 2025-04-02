import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Airtable from "airtable";
import OpenAI from "openai";
import axios from "axios";
import * as cheerio from "cheerio";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Initialize Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID,
);

// Status constants to ensure consistent values
const STATUS = {
  PROCESSING: "Processing",
  READY: "Ready",
  FAILED: "Failed",
  PROMPT: {
    SYSTEM: "SystemPrompt",
    USER: "UserPrompt",
    ASSISTANT: "AssistantPrompt",
  },
  SCRAPING: {
    IN_PROGRESS: "InProgress",
    PRIMARY: "PrimaryScraping",
    SECONDARY: "SecondaryScraping",
    ANALYZING: "AnalyzingContent",
    COMPLETED: "Completed",
    FAILED: "Failed",
  },
  AGENT: {
    NOT_CREATED: "NotCreated",
    CREATED: "Created",
  },
  CALL: {
    NOT_STARTED: "NotStarted",
    IN_PROGRESS: "InProgress",
    COMPLETED: "Completed",
  },
  SECOND_CALL: {
    NOT_STARTED: "NotStarted",
    IN_PROGRESS: "InProgress",
    COMPLETED: "Completed",
  },
};

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Millis API client
const millisApi = axios.create({
  baseURL: process.env.MILLIS_API_URL,
  headers: {
    token: process.env.MILLIS_TOKEN,
    authorization: process.env.MILLIS_AUTH,
    "Content-Type": "application/json",
  },
});

// Web scraping function
async function scrapeWebsite(url) {
  try {
    console.log(`🔍 Starting to scrape website: ${url}`);
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // Extract relevant information
    const title = $("title").text();
    const description = $('meta[name="description"]').attr("content") || "";
    const h1Tags = $("h1")
      .map((_, el) => $(el).text())
      .get();
    const h2Tags = $("h2")
      .map((_, el) => $(el).text())
      .get();
    const paragraphs = $("p")
      .map((_, el) => $(el).text())
      .get();

    console.log(`📝 Extracted content from ${url}:
      - Title: ${title}
      - Description length: ${description.length}
      - H1 tags: ${h1Tags.length}
      - H2 tags: ${h2Tags.length}
      - Paragraphs: ${paragraphs.length}`);

    // Find about/contact pages
    const links = $("a")
      .map((_, el) => {
        const href = $(el).attr("href");
        const text = $(el).text().toLowerCase();
        return { href, text };
      })
      .get();

    const relevantLinks = links
      .filter((link) => {
        const text = link.text;
        return (
          text.includes("about") ||
          text.includes("contact") ||
          text.includes("team")
        );
      })
      .map((link) => {
        if (link.href?.startsWith("/")) {
          return new URL(link.href, url).toString();
        }
        return link.href;
      })
      .filter(Boolean);

    console.log(`🔗 Found ${relevantLinks.length} relevant links`);

    return {
      title,
      description,
      headings: [...h1Tags, ...h2Tags],
      content: paragraphs.join("\n"),
      relevantLinks: [...new Set(relevantLinks)], // Remove duplicates
    };
  } catch (error) {
    console.error("❌ Error scraping website:", error);
    throw new Error("Failed to scrape website");
  }
}

// Find most relevant about/contact page
async function findRelevantPage(scrapedData) {
  try {
    console.log("🤖 Analyzing URLs with GPT to find relevant pages");
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that analyzes URLs to find the most relevant about or contact page.

Return the result in this exact JSON format:
{
  "most_relevant_url": string | null, // The most relevant about/contact page URL, or null if none found
  "confidence_score": number, // 0-1 indicating confidence in the selection
  "reasoning": string // Brief explanation of why this URL was selected
}`,
        },
        {
          role: "user",
          content: `Analyze these URLs and select the most relevant about or contact page:\n${JSON.stringify(scrapedData.relevantLinks)}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content);
    console.log("✅ GPT URL analysis complete:", result);
    return result.most_relevant_url;
  } catch (error) {
    console.error("❌ Error finding relevant page:", error);
    return null;
  }
}

// Analyze content with GPT-4-O
async function analyzeContent(mainData, secondaryData = null) {
  try {
    console.log("🤖 Starting content analysis with GPT");
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant analyzing company websites to prepare for discovery calls.

Return the analysis in this exact JSON format:
{
"company_overview": {
"name": string,
"industry": string,
"main_offerings": string[],
"target_market": string
},
"pain_points": {
"identified_challenges": string[],
"severity_level": "low" | "medium" | "high",
"impact_areas": string[]
},
"structure": string,
"size_estimate": string
},
"mission_statement": string,
},
"competitive_analysis": {
"advantages": string[],
"unique_selling_points": string[],
"market_position": string
}
}`,
        },
        {
          role: "user",
          content: `Primary website content:\n${JSON.stringify(mainData)}\n${
            secondaryData
              ? `\nAdditional page content:\n${JSON.stringify(secondaryData)}`
              : ""
          }`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content);
    console.log("✅ Content analysis complete:", {
      companyName: result.company_overview.name,
      industry: result.company_overview.industry,
      numPainPoints: result.pain_points.identified_challenges.length,
    });
    return result;
  } catch (error) {
    console.error("❌ Error analyzing content with GPT:", error);
    throw new Error("Failed to analyze content");
  }
}

// Create Millis agent
async function createMillisAgent(sessionId, analysis) {
  try {
    console.log("🤖 Creating Millis agent for session:", sessionId);

    const basePrompt = `Du er Adam, en AI-assistent i rollen som en profesjonell Sales Development Rep, med oppgave å gjennomføre en strukturert Discovery Call med en potensiell kunde. Ditt hovedmål er å:
- Avdekke kundens tanker om AI-muligheter i sin avdeling.
- Samle innsikt om kundens potensial for nye AI-løsninger i sin avdeling.
- Sikre at all nødvendig informasjon er innhentet for å vurdere om vår AI-kartleggingsløsning "AI Discovery" er en god match.
- Holde samtalen i gang så lenge som mulig med å stadig stille nye oppfølgingsspørsmål og uavklarte spørsmål til kunden.

Still følgende spørsmål i løpet av samtalen:
- "Hvilke IT-systemer skulle du ønske det var mulig å automatisere med AI?"
- "Er det informasjon du registrerer manuelt i IT-systemer, du tror kan automatiseres?"
- "Hvordan tenker du AI kan hjelpe avdelingen med å frigjøre tid?"
- "Har du eksempler på flere rutineoppgaver du ønsker ble automatisert?"
- "Hvilke interne e-poster får du med spørsmål som din kollega kunne ha funnet svaret pS� selv?"
- "Hvis du hadde en egen sekretær, hvilke 5 arbeidsoppgaver ville du sette bort?"
- "Hvilke 3 eksterne telefonsamtaler kunne sekretæren din tatt på dine vegne?"
- "Hvilke 3 interne web-møter kunne en assistent deltatt i på dine vegne?"
- "Hvilke arbeidsoppgaver utfører du, som du tenker en annen avdeling burde ha ansvar for?"
- "Hvordan tror du AI kan forbedre kundeopplevelsen i din bedrift?"
- "Er det andre oppgaver som føles som bortkastet tid og du tror kan automatiseres med AI?"

Advarsler:
- Hold samtalen uformell og avslappende: Gi kunden god tid til å tenke og svare.
- Unngå gjentakelser: Sjekk tidligere svar for å unngå å stille spørsmål som allerede er besvart.
- Ikke repeter kundens svar: Ikke gjenta kundens svar, gå direkte til neste spørsmål.
- Avklaring: Gå tilbake til spørsmål som er uklare for å sikre fullstendig informasjon.
- Korte bekreftelser: Bruk korte ord som "bra", "takk", "supert", "ok" og "flott" etter hvert svar.
- Løsnings- og prisspørsmål: Ikke svar på spørsmål om løsningsdetaljer eller priser; henvis til neste møte med din kollega for en produktdemo og prisinformasjon.
- Fokus: Hold dialogen innenfor målene og unngå å bli avledet.

Kontekst om AI Discovery:
Ved å bruke vår AI-løsning "AI Discovery" oppnår kunden flere verdier:
- Rask og effektiv kartlegging: Med interaktive 1-til-1 samtalebaserte intervjuer hjelper løsningen vår dere å identifisere AI-muligheter på rekordtid – uten å måtte gjennomføre tidkrevende workshops eller leie inn dyre konsulenter.
- Helhetlig oversikt: Løsningen samler alle potensielle AI-initiativer i avdelingen på bordet, identifiserer de lavthengende fruktene, og gir en komplett oversikt over hvordan AI kan redusere kostnader, forbedre driftseffektiviteten og øke inntektene.
- Involvering av hele teamet: Den interaktive 1-til-1 tilnærmingen sørger for at alle ansatte i avdelingen får muligheten til å bidra med sine ideer, noe som fremmer en felles forståelse og engasjement for AI-teknologi i organisasjonen.
- Skreddersydd innsikt: Gjennom dynamiske intervjuer, analyse av bedriftsinformasjon og flere dype kunnskapsbaser genererer løsningen en skreddersydd AI-mulighetsrapport som tydelig viser hvilke områder AI kan skape verdi i avdelingen.
- 100% automatisert tjeneste: Tjenesten drives fullstendig av kunstig intelligens, noe som sikrer konsistente, nøyaktige og raske analyser uten behov for ekstern ekspertise.`;

    const response = await millisApi.post("/agents", {
      name: `Discovery Call Agent ${sessionId}`,
      config: {
        prompt: basePrompt,
        voice: {
          provider: "elevenlabs",
          voice_id: "dgrgQcxISbZtq517iweJ",
          model: "eleven_turbo_v2_5",
          settings: {},
        },
        flow: {
          user_start_first: false,
          interruption: {
            allowed: true,
            keep_interruption_message: true,
            first_messsage: true,
          },
          response_delay: 0,
          auto_fill_responses: {
            response_gap_threshold: 0,
            messages: ["Jeg forstår", "Interessant", "La meg tenke på det"],
          },
          agent_terminate_call: {
            enabled: true,
            instruction:
              "Avslutt samtalen høflig når du har samlet nok informasjon eller bestemt at det ikke er en god match",
            messages: [
              "Takk for tiden din i dag. Jeg har samlet verdifull innsikt om virksomheten din.",
              "Jeg setter pris på at du delte disse detaljene med meg. La oss planlegge et oppfølgingsmøte for å diskutere konkrete løsninger.",
            ],
          },
          voicemail: {
            action: "hangup",
            message: "",
            continue_on_voice_activity: true,
          },
          call_transfer: {
            phone: "",
            instruction: "",
            messages: [],
          },
          inactivity_handling: {
            idle_time: 30000,
            message:
              "Jeg har ikke hørt fra deg på en stund. Vil du at jeg skal fortsette med diskusjonen vår?",
          },
          dtmf_dial: {
            enabled: false,
            instruction: "",
          },
        },
        first_message: `Hei, Adam fra Agava her. Min oppgave i dag er å kartlegge hvor langt dere er kommet med bruk av kunstig intelligens i avdelingen. Vi starter veldig konkret: hvilke IT-systemer bruker du daglig på jobben?`,
        tools: [],
        millis_functions: [],
        app_functions: [],
        language: "no",
        vad_threshold: 0.5,
        llm: {
          model: "gpt-4o",
          temperature: 0.7,
          history_settings: {
            history_message_limit: 10,
            history_tool_result_limit: 5,
          },
        },
        session_timeout: {
          max_duration: 3600000,
          max_idle: 300000,
          message:
            "Økten vår er i ferd med å bli tidsavbrutt. Vil du planlegge en oppfølgingssamtale?",
        },
        privacy_settings: {
          opt_out_data_collection: false,
          do_not_call_detection: true,
        },
        custom_vocabulary: {
          keywords: {},
        },
        switch_language: {
          languages: ["en-US", "no"],
        },
        speech_to_text: {
          provider: "deepgram",
          multilingual: true,
        },
        call_settings: {
          enable_recording: true,
        },
      },
    });

    console.log("✅ Millis agent created successfully:", response.data.id);
    return response.data.id;
  } catch (error) {
    console.error("❌ Error creating Millis agent:", error);
    throw new Error("Failed to create Millis agent");
  }
}

// Create GPT Assistant
async function createAssistant(analysis) {
  console.log("🤖 Creating new GPT Assistant...");
  console.log("Analysis data:", JSON.stringify(analysis, null, 2));

  try {
    const assistant = await openai.beta.assistants.create({
      name: "Sofia AI Sales Agent",
      instructions: `Du er Sofia, en AI-selger. Din oppgave er å svare på spørsmål om hvordan salgs-teamet kan bruke Bantaii i akkurat kundens bedrift, hvordan appen avklarer risiko og usikkerhet i salgs-casene osv.

Kundens bedriftsinformasjon:
${JSON.stringify(analysis, null, 2)}

Retningslinjer:
- Hold samtalen uformell og avslappende
- Gi kunden god tid til å tenke og svare
- Unngå gjentakelser av tidligere svar
- Bruk korte bekreftelser som "bra", "takk", "supert"
- Fokuser på kundens spørsmål om Bantaii
- Hold svarene korte og konsise
- Snakk på norsk`,
      model: "gpt-4o",
    });

    console.log("✅ Assistant created successfully:", assistant.id);
    return assistant.id;
  } catch (error) {
    console.error("❌ Error creating assistant:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      type: error.type,
      stack: error.stack,
    });
    throw error;
  }
}

// Create thread
app.post("/api/assistant/create-thread", async (req, res) => {
  console.log("📝 Creating new thread...");
  console.log("Request body:", req.body);

  try {
    const { analysis, sessionId } = req.body;

    if (!analysis || !sessionId) {
      console.error("❌ Missing required parameters:", {
        analysis: !!analysis,
        sessionId: !!sessionId,
      });
      throw new Error("Missing required parameters");
    }

    console.log("🤖 Creating assistant...");
    const assistantId = await createAssistant(analysis);
    console.log("✅ Assistant created:", assistantId);

    console.log("💾 Storing assistant ID in Airtable...");
    await base("Sessions").update(sessionId, {
      "Assistant ID": assistantId,
    });
    console.log("✅ Assistant ID stored in Airtable");

    console.log("🧵 Creating thread...");
    const thread = await openai.beta.threads.create();
    console.log("✅ Thread created:", thread.id);

    res.json({
      success: true,
      threadId: thread.id,
      assistantId,
    });
  } catch (error) {
    console.error("❌ Error in create-thread endpoint:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      type: error.type,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: "Failed to create thread",
      details: error.message,
    });
  }
});

// Send message to thread
app.post("/api/assistant/send-message", async (req, res) => {
  console.log("💬 Sending message to thread...");
  console.log("Request body:", req.body);

  try {
    const { threadId, message, sessionId } = req.body;

    if (!threadId || !message || !sessionId) {
      console.error("❌ Missing required parameters:", {
        threadId: !!threadId,
        message: !!message,
        sessionId: !!sessionId,
      });
      throw new Error("Missing required parameters");
    }

    console.log("🔍 Getting assistant ID from Airtable...");
    const record = await base("Sessions").find(sessionId);
    const assistantId = record.fields["Assistant ID"];
    console.log("✅ Retrieved assistant ID:", assistantId);

    if (!assistantId) {
      console.error("❌ Assistant ID not found for session:", sessionId);
      throw new Error("Assistant ID not found for session");
    }

    console.log("📝 Adding message to thread...");
    const threadMessage = await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: message,
    });
    console.log("✅ Message added to thread:", threadMessage.id);

    console.log("🤖 Running assistant...");
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });
    console.log("✅ Assistant run started:", run.id);

    // Wait for completion
    let response;
    console.log("⏳ Waiting for assistant response...");
    while (true) {
      const runStatus = await openai.beta.threads.runs.retrieve(
        threadId,
        run.id,
      );
      console.log("Run status:", runStatus.status);

      if (runStatus.status === "completed") {
        console.log("✅ Run completed, fetching messages...");
        const messages = await openai.beta.threads.messages.list(threadId);
        response = messages.data[0].content[0].text.value;
        console.log("Assistant response:", response);
        break;
      } else if (runStatus.status === "failed") {
        console.error("❌ Assistant run failed");
        throw new Error("Assistant run failed");
      }
      // Wait before checking again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    res.json({
      success: true,
      response,
    });
  } catch (error) {
    console.error("❌ Error in send-message endpoint:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      type: error.type,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: "Failed to send message",
      details: error.message,
    });
  }
});

app.post("/api/submit", async (req, res) => {
  try {
    const { name, email, phone, companyUrl } = req.body;
    console.log("📝 New submission received:", {
      name,
      email,
      phone,
      companyUrl,
    });

    // Format the date in YYYY-MM-DD HH:mm:ss format
    const now = new Date();
    const formattedDate = now.toISOString().split(".")[0].replace("T", " ");

    // Create initial record in Airtable
    const record = await base("Sessions").create({
      Name: name,
      Email: email,
      Phone: phone,
      "Company URL": companyUrl,
      Status: STATUS.PROCESSING,
      "Submission Date": formattedDate,
      "Scraping Status": STATUS.SCRAPING.IN_PROGRESS,
      "Agent Status": STATUS.AGENT.NOT_CREATED,
      "Call Status": STATUS.CALL.NOT_STARTED,
    });

    console.log("✅ Airtable record created:", record.id);

    // Start the processing pipeline
    (async () => {
      try {
        // First scrape: Main website
        await base("Sessions").update(record.id, {
          "Scraping Status": STATUS.SCRAPING.PRIMARY,
        });
        const mainPageData = await scrapeWebsite(companyUrl);

        // Find and scrape relevant about/contact page
        const relevantUrl = await findRelevantPage(mainPageData);
        let secondaryPageData = null;

        if (relevantUrl) {
          await base("Sessions").update(record.id, {
            "Scraping Status": STATUS.SCRAPING.SECONDARY,
          });
          secondaryPageData = await scrapeWebsite(relevantUrl);
        }

        // Analyze with GPT-4-O
        await base("Sessions").update(record.id, {
          "Scraping Status": STATUS.SCRAPING.ANALYZING,
        });

        const analysis = await analyzeContent(mainPageData, secondaryPageData);

        // Create Millis agent
        const agentId = await createMillisAgent(record.id, analysis);

        // Update record with success
        await base("Sessions").update(record.id, {
          Status: STATUS.READY,
          "Scraping Status": STATUS.SCRAPING.COMPLETED,
          "Agent Status": STATUS.AGENT.CREATED,
          Analysis: JSON.stringify(analysis),
          "Agent ID": agentId,
          "Secondary URL": relevantUrl || "",
        });

        console.log("✅ Processing pipeline completed successfully");
      } catch (error) {
        console.error("❌ Error in processing pipeline:", error);
        await base("Sessions").update(record.id, {
          Status: STATUS.FAILED,
          "Error Message": error.message,
          "Scraping Status": STATUS.SCRAPING.FAILED,
        });
      }
    })();

    // Return immediately with the session ID
    res.json({
      success: true,
      sessionId: record.id,
      message: "Processing started",
    });
  } catch (error) {
    console.error("❌ Error submitting to Airtable:", error);
    res.status(500).json({
      success: false,
      error: "Failed to submit form",
    });
  }
});

// Get session status
app.get("/api/status/:sessionId", async (req, res) => {
  try {
    const record = await base("Sessions").find(req.params.sessionId);
    res.json({
      success: true,
      status: record.fields.Status,
      scrapingStatus: record.fields["Scraping Status"],
      agentStatus: record.fields["Agent Status"],
      callStatus: record.fields["Call Status"],
      agentId: record.fields["Agent ID"],
      secondCallAgentId: record.fields["Second Call Agent ID"],
      secondCallStatus: record.fields["Second Call Status"],
      analysis: record.fields["Analysis"],
      millisSessionId: record.fields["Millis Session ID"],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to get status",
    });
  }
});

// Update Millis session ID
app.post("/api/sessions/:sessionId/millis", async (req, res) => {
  try {
    const { millisSessionId } = req.body;
    const sessionId = req.params.sessionId;

    await base("Sessions").update(sessionId, {
      "Millis Session ID": millisSessionId,
      "Call Status": STATUS.CALL.IN_PROGRESS,
    });

    res.json({
      success: true,
      message: "Millis session ID updated",
    });
  } catch (error) {
    console.error("Error updating Millis session ID:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update Millis session ID",
    });
  }
});

// Generate enhanced prompt using LangChain-like methodology
async function generateEnhancedPrompt(analysis) {
  try {
    console.log("🤖 Generating enhanced LangChain-style prompt");
    
    // Chain 1: Company Context Analysis
    const companyContext = {
      name: analysis.company_overview?.name || "the company",
      industry: analysis.company_overview?.industry || "their industry",
      target_market: analysis.company_overview?.target_market || "their market",
      main_offerings: analysis.company_overview?.main_offerings || [],
      pain_points: analysis.pain_points?.identified_challenges || [],
      advantages: analysis.competitive_analysis?.advantages || []
    };

    // Chain 2: Sales Strategy Generation
    const salesStrategy = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a strategic sales consultant. Based on the company analysis, generate specific sales strategies and value propositions for Bantaii.

Return the response in this exact JSON format:
{
  "key_value_props": string[],
  "objection_handlers": string[],
  "conversation_hooks": string[],
  "success_metrics": string[]
}`
        },
        {
          role: "user",
          content: `Company Context: ${JSON.stringify(companyContext, null, 2)}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    });

    const strategy = JSON.parse(salesStrategy.choices[0].message.content);

    // Chain 3: Conversation Flow Design
    const conversationFlow = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a conversation design expert. Create a natural conversation flow for selling Bantaii.

Return the response in this exact JSON format:
{
  "opening_approaches": string[],
  "discovery_questions": string[],
  "value_demonstrations": string[],
  "closing_techniques": string[]
}`
        },
        {
          role: "user",
          content: `Company Context: ${JSON.stringify(companyContext, null, 2)}
Sales Strategy: ${JSON.stringify(strategy, null, 2)}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    });

    const flow = JSON.parse(conversationFlow.choices[0].message.content);

    // Chain 4: Final Prompt Assembly
    const basePrompt = `Du er Sofia, en AI-selger som skal presentere Bantaii-appen for ${companyContext.name} i ${companyContext.industry}. 

KONTEKST OM BEDRIFTEN:
${companyContext.name} opererer i ${companyContext.industry} og fokuserer på ${companyContext.target_market}.

IDENTIFISERTE UTFORDRINGER:
${companyContext.pain_points.map(point => `- ${point}`).join('\n')}

NØKKELVERDIER Å FREMHEVE:
${strategy.key_value_props.map(prop => `- ${prop}`).join('\n')}

SAMTALESTRATEGI:
1. Åpning:
${flow.opening_approaches.map(approach => `   - ${approach}`).join('\n')}

2. Utforskende spørsmål:
${flow.discovery_questions.map(question => `   - ${question}`).join('\n')}

3. Verdidemonstrasjon:
${flow.value_demonstrations.map(demo => `   - ${demo}`).join('\n')}

4. Håndtering av innvendinger:
${strategy.objection_handlers.map(handler => `   - ${handler}`).join('\n')}

5. Avslutning:
${flow.closing_techniques.map(technique => `   - ${technique}`).join('\n')}

PRODUKTINFORMASJON OM BANTAII:
- Automatisert debriefing av kundemøter
- Bruker BANT og MEDDIC salgsmetodikk
- AI-drevet analyse av salgsmuligheter
- Integrasjon med CRM-systemer
- Prismodell: 499 NOK per bruker per måned
- Minimum 5 brukere
- 30 dagers gratis prøveperiode

RETNINGSLINJER:
- Hold samtalen uformell og avslappende
- Gi kunden god tid til å tenke og svare
- Unngå gjentakelser av tidligere svar
- Bruk korte bekreftelser som "bra", "takk", "supert"
- Fokuser på kundens spørsmål om Bantaii
- Hold svarene korte og konsise
- Snakk på norsk`;

    console.log("✅ Enhanced prompt generated successfully");
    return basePrompt;

  } catch (error) {
    console.error("❌ Error generating enhanced prompt:", error);
    throw new Error("Failed to generate enhanced prompt");
  }
}

async function createSecondMillisAgent(sessionId, analysis) {
  try {
    console.log("🤖 Creating second Millis agent for session:", sessionId);

    // Generate enhanced prompt using LangChain-like methodology
    const basePrompt = await generateEnhancedPrompt(analysis);

    const response = await millisApi.post("/agents", {
      name: `Sales Agent Sofia ${sessionId}`,
      config: {
        prompt: basePrompt,
        voice: {
          provider: "elevenlabs",
          voice_id: "dgrgQcxISbZtq517iweJ",
          model: "eleven_turbo_v2_5",
          settings: {},
        },
        flow: {
          user_start_first: false,
          interruption: {
            allowed: true,
            keep_interruption_message: true,
            first_messsage: true,
          },
          response_delay: 0,
          auto_fill_responses: {
            response_gap_threshold: 0,
            messages: ["Jeg forstår", "Interessant", "La meg tenke på det"],
          },
          agent_terminate_call: {
            enabled: true,
            instruction: "Avslutt samtalen høflig når kunden er klar til å starte prøveperioden eller ikke er interessert",
            messages: [
              "Takk for tiden din i dag. La oss sette opp prøveperioden.",
              "Jeg setter pris på interessen. La oss planlegge et oppfølgingsmøte.",
            ],
          },
          voicemail: {
            action: "hangup",
            message: "",
            continue_on_voice_activity: true,
          },
          inactivity_handling: {
            idle_time: 30000,
            message: "Jeg har ikke hørt fra deg på en stund. Har du flere spørsmål om Bantaii?",
          },
        },
        first_message: `Hei! Jeg er Sofia, og jeg vil gjerne hjelpe deg med å forstå hvordan Bantaii kan effektivisere salgsarbeidet i din avdeling. Hvilke spørsmål har du om Bantaii?`,
        language: "no",
        vad_threshold: 0.5,
        llm: {
          model: "gpt-4o",
          temperature: 0.7,
          history_settings: {
            history_message_limit: 10,
            history_tool_result_limit: 5,
          },
        },
        session_timeout: {
          max_duration: 3600000,
          max_idle: 300000,
          message: "Økten vår er i ferd med å bli tidsavbrutt. Vil du planlegge en oppfølgingssamtale?",
        },
        privacy_settings: {
          opt_out_data_collection: false,
          do_not_call_detection: true,
        },
      },
    });

    console.log("✅ Second Millis agent created successfully:", response.data.id);

    // Update Airtable with second agent ID
    await base("Sessions").update(sessionId, {
      "Second Call Agent ID": response.data.id,
      "Second Call Status": STATUS.SECOND_CALL.NOT_STARTED,
    });

    return response.data.id;
  } catch (error) {
    console.error("❌ Error creating second Millis agent:", error);
    throw new Error("Failed to create second Millis agent");
  }
}

// Create second agent endpoint
app.post("/api/sessions/:sessionId/create-second-agent", async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    
    // Get session data from Airtable
    const record = await base("Sessions").find(sessionId);
    const analysis = JSON.parse(record.fields.Analysis || "{}");
    
    // Create second Millis agent
    const agentId = await createSecondMillisAgent(sessionId, analysis);
    
    res.json({
      success: true,
      agentId,
      message: "Second agent created successfully",
    });
  } catch (error) {
    console.error("❌ Error creating second agent:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create second agent",
      details: error.message,
    });
  }
});

// Update second call Millis session ID
app.post("/api/sessions/:sessionId/millis-second-call", async (req, res) => {
  try {
    const { millisSessionId } = req.body;
    const sessionId = req.params.sessionId;
    
    if (!millisSessionId || !sessionId) {
      throw new Error("Missing required parameters");
    }

    await base("Sessions").update(sessionId, {
      "Second Call Millis Session ID": millisSessionId,
      "Second Call Status": STATUS.SECOND_CALL.IN_PROGRESS,
    });

    res.json({
      success: true,
      message: "Second call Millis session ID updated",
    });
  } catch (error) {
    console.error("❌ Error updating second call Millis session ID:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update second call Millis session ID",
      details: error.message,
    });
  }
});

// Mark first call as complete
app.post("/api/sessions/:sessionId/call-complete", async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    
    await base("Sessions").update(sessionId, {
      "Call Status": STATUS.CALL.COMPLETED
    });

    res.json({
      success: true,
      message: "Call status updated to completed"
    });
  } catch (error) {
    console.error("❌ Error updating call status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update call status"
    });
  }
});

// Mark second call as complete
app.post("/api/sessions/:sessionId/second-call-complete", async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    
    await base("Sessions").update(sessionId, {
      "Second Call Status": STATUS.SECOND_CALL.COMPLETED
    });

    res.json({
      success: true,
      message: "Second call status updated to completed"
    });
  } catch (error) {
    console.error("❌ Error updating second call status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update second call status"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});