require("dotenv").config();
const fs = require("fs");

class LangflowClient {
  constructor(baseURL, applicationToken) {
    this.baseURL = baseURL;
    this.applicationToken = applicationToken;
  }
  async post(endpoint, body, headers = { "Content-Type": "application/json" }) {
    headers["Authorization"] = `Bearer ${this.applicationToken}`;
    headers["Content-Type"] = "application/json";
    const url = `${this.baseURL}${endpoint}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
      });

      const responseMessage = await response.json();
      if (!response.ok) {
        throw new Error(
          `${response.status} ${response.statusText} - ${JSON.stringify(
            responseMessage
          )}`
        );
      }
      return responseMessage;
    } catch (error) {
      console.error("Request Error:", error.message);
      throw error;
    }
  }

  async initiateSession(
    flowId,
    langflowId,
    inputValue,
    inputType = "chat",
    outputType = "chat",
    stream = false,
    tweaks = {}
  ) {
    const endpoint = `/lf/${langflowId}/api/v1/run/${flowId}?stream=${stream}`;
    return this.post(endpoint, {
      input_value: inputValue,
      input_type: inputType,
      output_type: outputType,
      tweaks: tweaks,
    });
  }

  handleStream(streamUrl, onUpdate, onClose, onError) {
    const eventSource = new EventSource(streamUrl);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onUpdate(data);
    };

    eventSource.onerror = (event) => {
      console.error("Stream Error:", event);
      onError(event);
      eventSource.close();
    };

    eventSource.addEventListener("close", () => {
      onClose("Stream closed");
      eventSource.close();
    });

    return eventSource;
  }

  async runFlow(
    flowIdOrName,
    langflowId,
    inputValue,
    inputType = "chat",
    outputType = "chat",
    tweaks = {},
    stream = false,
    onUpdate,
    onClose,
    onError
  ) {
    try {
      const initResponse = await this.initiateSession(
        flowIdOrName,
        langflowId,
        inputValue,
        inputType,
        outputType,
        stream,
        tweaks
      );
      if (
        stream &&
        initResponse &&
        initResponse.outputs &&
        initResponse.outputs[0].outputs[0].artifacts.stream_url
      ) {
        const streamUrl =
          initResponse.outputs[0].outputs[0].artifacts.stream_url;
        this.handleStream(streamUrl, onUpdate, onClose, onError);
      }
      return initResponse;
    } catch (error) {
      console.error("Error running flow:", error);
      onError("Error initiating session");
    }
  }
}

async function main(
  inputValue,
  inputType = "chat",
  outputType = "chat",
  stream = false
) {
  const flowIdOrName = "3befb806-b6f3-4e74-8430-f618ef654cc4";
  const langflowId = "4b2adee2-0c34-4f29-8b9a-ff1d573c8a03";
  const applicationToken = process.env.token;
  const langflowClient = new LangflowClient(
    "https://api.langflow.astra.datastax.com",
    applicationToken
  );

  try {
    const tweaks = {
      "ChatInput-uUi6s": {},
      "Prompt-9yPN9": {},
      "GroqModel-n91pv": {},
      "AstraDB-BJgM8": {},
      "ParseData-N1BXf": {},
      "ChatOutput-y4A36": {},
      "HuggingFaceInferenceAPIEmbeddings-tH0XX": {},
      "File-MpR3h": {},
      "SplitText-Iyful": {},
      "AstraDB-lXeCy": {},
      "HuggingFaceInferenceAPIEmbeddings-MQaOg": {},
    };
    const response = await langflowClient.runFlow(
      flowIdOrName,
      langflowId,
      inputValue,
      inputType,
      outputType,
      tweaks,
      stream,
      (data) => fs.appendFileSync("output.html", `Received: ${data.chunk}\n`), // onUpdate
      (message) =>
        fs.appendFileSync("output.html", `Stream Closed: ${message}\n`), // onClose
      (error) => fs.appendFileSync("output.html", `Stream Error: ${error}\n`) // onError
    );
    if (!stream && response && response.outputs) {
      const flowOutputs = response.outputs[0];
      const firstComponentOutputs = flowOutputs.outputs[0];
      const output = firstComponentOutputs.outputs.message;

      fs.writeFileSync("output.html", `Final Output: ${output.message.text}\n`);
    }
  } catch (error) {
    fs.writeFileSync("output.html", `Main Error: ${error.message}\n`);
  }
}

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error(
    'Please run the file with the message as an argument: node <YOUR_FILE_NAME>.js "user_message"'
  );
}
main(
  args[0], // inputValue
  args[1], // inputType
  args[2], // outputType
  args[3] === "true" // stream
);
