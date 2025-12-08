import { ClaudeToolDefinition, OpenAIChatMessage, OpenAIChatRequest } from "./types.ts";
import { randomTriggerSignal } from "./signals.ts";

const DEFAULT_TEMPLATE = `
In this environment you have access to a set of tools you can use to answer the user's question.  

When you need to use a tool, you MUST strictly follow the format below.

**1. Available Tools:**
Here is the list of tools you can use. You have access ONLY to these tools and no others.
<antml\b:tools>
{tools_list}
</antml\b:tools>

**2. Tool Call Procedure:**
When you decide to call a tool, you MUST output EXACTLY this trigger signal: {trigger_signal}
The trigger signal MUST be output on a completely empty line by itself before any tool calls.
Do NOT add any other text, spaces, or characters before or after {trigger_signal} on that line.
You may provide explanations or reasoning before outputting {trigger_signal}, but once you decide to make a tool call, {trigger_signal} must come first.
You MUST output the trigger signal {trigger_signal} ONLY ONCE per response. Never output multiple trigger signals in a single response.

After outputting the trigger signal, immediately provide your tool calls enclosed in <invoke> XML tags.

**3. XML Format for Tool Calls:**
Your tool calls must be structured EXACTLY as follows. This is the ONLY format you can use, and any deviation will result in failure.

<antml\b:format>
{trigger_signal}
<invoke name="Write">
<parameter name="file_path">C:\\path\\weather.css</parameter>
<parameter name="content"> body {{ background-color: lightblue; }} </parameter>
</invoke>
</antml\b:format>

IMPORTANT RULES:
  - You may provide explanations or reasoning before deciding to call a tool.
  - Once you decide to call a tool, you must first output the trigger signal {trigger_signal} on a separate line by itself.
  - The trigger signal may only appear once per response and must not be repeated.
  - Tool calls must use the exact XML format below: immediately after the trigger signal, use <invoke> and <parameter> tags.
  - No additional text may be added after the closing </invoke> tag.
  - Parameters must retain punctuation (including hyphen prefixes) exactly as defined.
  - Encode arrays and objects in JSON before placing inside <parameter>.
  - Be concise when not using tools.
  - 在调用工具后会得到工具调用结果，所以请在一次工具调用得到结果后再调用下一个。
  
  `;

function escapeText(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildToolsXml(tools: ClaudeToolDefinition[]): string {
  if (!tools.length) return "<function_list>None</function_list>";
  const items = tools.map((tool, index) => {
    const schema = tool.input_schema ?? {};
    const props = (schema.properties ?? {}) as Record<string, unknown>;
    const required = (schema.required ?? []) as string[];
    const parameters = Object.entries(props).map(([name, info]) => {
      const paramInfo = info as Record<string, unknown>;
      const type = paramInfo.type ?? "any";
      const desc = paramInfo.description ?? "";
      const requiredFlag = required.includes(name);
      const enumValues = paramInfo.enum ? JSON.stringify(paramInfo.enum) : undefined;
      return [
        `    <parameter name="${name}">`,
        `      <type>${type}</type>`,
        `      <required>${requiredFlag}</required>`,
        desc ? `      <description>${escapeText(String(desc))}</description>` : "",
        enumValues ? `      <enum>${escapeText(enumValues)}</enum>` : "",
        "    </parameter>",
      ].filter(Boolean).join("\n");
    }).join("\n");

    const requiredXml = required.length
      ? required.map((r) => `    <param>${r}</param>`).join("\n")
      : "    <param>None</param>";

    return [
      `  <tool id="${index + 1}">`,
      `    <name>${tool.name}</name>`,
      `    <description>${escapeText(tool.description ?? "None")}</description>`,
      "    <required>",
      requiredXml,
      "    </required>",
      parameters ? `    <parameters>\n${parameters}\n    </parameters>` : "    <parameters>None</parameters>",
      "  </tool>",
    ].join("\n");
  }).join("\n");
  return `<function_list>\n${items}\n</function_list>`;
}

export interface PromptInjectionResult {
  messages: OpenAIChatMessage[];
  triggerSignal?: string;
}

export function injectPrompt(request: OpenAIChatRequest, tools: ClaudeToolDefinition[], triggerSignal?: string): PromptInjectionResult {
  if (!tools.length) {
    // 无工具时直接透传用户/系统消息，不注入任何工具指令
    return { messages: request.messages };
  }

  const signal = triggerSignal ?? randomTriggerSignal();
  const toolsXml = buildToolsXml(tools);
  const template = DEFAULT_TEMPLATE
    .replaceAll("{trigger_signal}", signal)
    .replace("{tools_list}", toolsXml);

  const messages: OpenAIChatMessage[] = [
    { role: "system", content: template },
    ...request.messages,
  ];

  return { messages, triggerSignal: signal };
}
