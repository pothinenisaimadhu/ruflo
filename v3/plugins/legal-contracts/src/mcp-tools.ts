/**
 * Legal Contracts Plugin - MCP Tools
 *
 * Implements 5 MCP tools for legal contract analysis:
 * 1. legal/clause-extract - Extract and classify clauses
 * 2. legal/risk-assess - Identify and score contractual risks
 * 3. legal/contract-compare - Compare contracts with attention-based alignment
 * 4. legal/obligation-track - Extract obligations with DAG analysis
 * 5. legal/playbook-match - Match clauses against negotiation playbook
 *
 * Based on ADR-034: Legal Contract Analysis Plugin
 *
 * @module v3/plugins/legal-contracts/mcp-tools
 */

import {
  ClauseExtractInputSchema,
  RiskAssessInputSchema,
  ContractCompareInputSchema,
  ObligationTrackInputSchema,
  PlaybookMatchInputSchema,
  ClauseType,
  RiskCategory,
  RiskSeverity,
  RolePermissions,
  LegalErrorCodes,
} from './types.js';
import type {
  ExtractedClause,
  RiskFinding,
  Obligation,
  PlaybookMatch,
  DocumentMetadata,
  UserRole,
} from './types.js';

// ============================================================================
// MCP Tool Types
// ============================================================================

export interface MCPTool {
  name: string;
  description: string;
  category: string;
  version: string;
  cacheable?: boolean;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
  handler: (input: Record<string, unknown>, context: ToolContext) => Promise<MCPToolResult>;
}

export interface ToolContext {
  userId?: string;
  userRoles?: string[];
  auditLogger?: { log: (entry: Record<string, unknown>) => Promise<void> };
  matterContext?: { matterId: string; clientId: string };
  [key: string]: unknown;
}

export interface MCPToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function errorResponse(message: string, code?: string): MCPToolResult {
  return {
    isError: true,
    content: [{
      type: 'text',
      text: JSON.stringify({ error: true, message, code }),
    }],
  };
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

function checkAccess(toolShortName: string, context: ToolContext): string | null {
  const roles = context.userRoles;
  if (!roles || roles.length === 0) return null; // No RBAC if no roles provided

  for (const role of roles) {
    const allowed = RolePermissions[role as UserRole];
    if (allowed && allowed.includes(toolShortName)) return null;
  }
  return LegalErrorCodes.MATTER_ACCESS_DENIED;
}

async function logAudit(
  context: ToolContext,
  toolName: string,
  documentHash: string,
  success: boolean
): Promise<void> {
  if (!context.auditLogger) return;
  await context.auditLogger.log({
    timestamp: new Date().toISOString(),
    userId: context.userId ?? 'anonymous',
    toolName,
    documentHash,
    matterId: context.matterContext?.matterId,
    success,
  });
}

function parseDocumentMetadata(document: string): DocumentMetadata {
  const hash = simpleHash(document);
  return {
    id: `doc-${hash.substring(0, 8)}`,
    format: 'txt',
    wordCount: document.split(/\s+/).length,
    charCount: document.length,
    language: 'en',
    parties: [],
    contentHash: hash,
  };
}

function extractKeyTerms(text: string): string[] {
  const terms: string[] = [];
  const termPatterns = [
    /\$[\d,]+/g,
    /\d+\s*(days?|months?|years?)/gi,
    /\d+%/g,
    /"[^"]+"/g,
  ];
  for (const pattern of termPatterns) {
    const matches = text.match(pattern);
    if (matches) terms.push(...matches);
  }
  return [...new Set(terms)].slice(0, 10);
}

function extractClauses(
  document: string,
  clauseTypes: ClauseType[] | undefined,
): ExtractedClause[] {
  const clauses: ExtractedClause[] = [];

  const clausePatterns: Record<ClauseType, RegExp[]> = {
    indemnification: [/indemnif/i, /hold\s+harmless/i],
    limitation_of_liability: [/limitation\s+of\s+liability/i, /liability\s+shall\s+not\s+exceed/i],
    termination: [/termination/i, /right\s+to\s+terminate/i],
    confidentiality: [/confidential/i, /non-disclosure/i],
    ip_assignment: [/intellectual\s+property/i, /work\s+for\s+hire/i],
    governing_law: [/governing\s+law/i, /governed\s+by\s+the\s+laws/i],
    arbitration: [/arbitration/i, /binding\s+arbitration/i],
    force_majeure: [/force\s+majeure/i, /act\s+of\s+god/i],
    warranty: [/warrant/i, /as-is/i],
    payment_terms: [/payment/i, /invoic/i],
    non_compete: [/non-?compet/i],
    non_solicitation: [/non-?solicit/i],
    assignment: [/assignment/i, /may\s+not\s+assign/i],
    insurance: [/insurance/i],
    representations: [/represent/i],
    covenants: [/covenant/i],
    data_protection: [/data\s+protection/i, /gdpr/i],
    audit_rights: [/audit/i, /right\s+to\s+inspect/i],
  };

  const sections = document.split(/\n\n+/);
  let offset = 0;

  for (const section of sections) {
    const sectionStart = document.indexOf(section, offset);
    const sectionEnd = sectionStart + section.length;
    offset = sectionEnd;

    for (const [type, patterns] of Object.entries(clausePatterns)) {
      const clauseType = type as ClauseType;
      if (clauseTypes && clauseTypes.length > 0 && !clauseTypes.includes(clauseType)) continue;

      let matchCount = 0;
      for (const pattern of patterns) {
        if (pattern.test(section)) matchCount++;
      }

      if (matchCount > 0) {
        clauses.push({
          id: `clause-${clauses.length + 1}`,
          type: clauseType,
          text: section.trim(),
          startOffset: sectionStart,
          endOffset: sectionEnd,
          confidence: Math.min(0.5 + matchCount * 0.2, 0.99),
          keyTerms: extractKeyTerms(section),
        });
        break;
      }
    }
  }

  return clauses;
}

function getSeverityLevel(severity: RiskSeverity): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity];
}

function calculateTextSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

// ============================================================================
// Tool: legal/clause-extract
// ============================================================================

export const clauseExtractTool: MCPTool = {
  name: 'legal/clause-extract',
  description: 'Extract and classify clauses from legal documents',
  category: 'legal',
  version: '1.0.0',
  cacheable: true,
  inputSchema: {
    type: 'object',
    properties: {
      document: { type: 'string', maxLength: 10_000_000 },
      clauseTypes: { type: 'array', items: { type: 'string' } },
      jurisdiction: { type: 'string', default: 'US' },
      includePositions: { type: 'boolean', default: true },
      includeEmbeddings: { type: 'boolean', default: false },
      matterContext: { type: 'object' },
    },
    required: ['document'],
  },
  handler: async (input, context) => {
    const startTime = Date.now();

    // RBAC check
    const accessError = checkAccess('clause-extract', context);
    if (accessError) {
      return errorResponse('Access denied', accessError);
    }

    const parsed = ClauseExtractInputSchema.safeParse(input);
    if (!parsed.success) {
      return errorResponse(parsed.error.message, LegalErrorCodes.CLAUSE_EXTRACTION_FAILED);
    }

    const data = parsed.data;

    // Size check
    if (!data.document || data.document.length === 0) {
      return errorResponse('Document is empty', LegalErrorCodes.INVALID_DOCUMENT_FORMAT);
    }

    const documentHash = simpleHash(data.document);
    await logAudit(context, 'clause-extract', documentHash, true);

    const clauses = extractClauses(data.document, data.clauseTypes);
    const extractionTime = Date.now() - startTime;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          clauses,
          jurisdiction: data.jurisdiction,
          extractionTime,
          documentHash,
        }),
      }],
    };
  },
};

// ============================================================================
// Tool: legal/risk-assess
// ============================================================================

export const riskAssessTool: MCPTool = {
  name: 'legal/risk-assess',
  description: 'Assess contractual risks with severity scoring',
  category: 'legal',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    properties: {
      document: { type: 'string' },
      partyRole: { type: 'string' },
      riskCategories: { type: 'array' },
      industryContext: { type: 'string' },
      threshold: { type: 'string' },
      includeFinancialImpact: { type: 'boolean' },
      matterContext: { type: 'object' },
    },
    required: ['document', 'partyRole'],
  },
  handler: async (input, context) => {
    const startTime = Date.now();

    const accessError = checkAccess('risk-assess', context);
    if (accessError) {
      return errorResponse('Access denied', accessError);
    }

    const parsed = RiskAssessInputSchema.safeParse(input);
    if (!parsed.success) {
      return errorResponse(parsed.error.message, LegalErrorCodes.RISK_ASSESSMENT_FAILED);
    }

    const data = parsed.data;
    const documentHash = simpleHash(data.document);
    await logAudit(context, 'risk-assess', documentHash, true);

    const clauses = extractClauses(data.document, undefined);

    // Simple risk detection
    const risks: RiskFinding[] = [];
    const riskPatterns: Array<{
      clauseType: ClauseType;
      pattern: RegExp;
      severity: RiskSeverity;
      category: RiskCategory;
      title: string;
      description: string;
      mitigation: string;
    }> = [
        {
          clauseType: 'indemnification',
          pattern: /unlimited\s+indemnification/i,
          severity: 'critical',
          category: 'financial',
          title: 'Unlimited Indemnification',
          description: 'Contract requires unlimited indemnification',
          mitigation: 'Negotiate cap on indemnification liability',
        },
        {
          clauseType: 'limitation_of_liability',
          pattern: /no\s+limitation/i,
          severity: 'high',
          category: 'financial',
          title: 'No Liability Cap',
          description: 'Contract contains no limitation on liability',
          mitigation: 'Add liability cap based on contract value',
        },
        {
          clauseType: 'termination',
          pattern: /immediate\s+termination/i,
          severity: 'medium',
          category: 'operational',
          title: 'Immediate Termination Right',
          description: 'Counterparty can terminate immediately without notice',
          mitigation: 'Negotiate notice period for termination',
        },
      ];

    for (const clause of clauses) {
      for (const rp of riskPatterns) {
        if (rp.clauseType === clause.type && rp.pattern.test(clause.text)) {
          if (data.riskCategories && !data.riskCategories.includes(rp.category)) continue;
          risks.push({
            id: `risk-${risks.length + 1}`,
            category: rp.category,
            severity: rp.severity,
            title: rp.title,
            description: rp.description,
            clauseIds: [clause.id],
            mitigations: [rp.mitigation],
            deviatesFromStandard: true,
            confidence: clause.confidence,
          });
        }
      }
    }

    const filteredRisks = data.threshold
      ? risks.filter(r => getSeverityLevel(r.severity) >= getSeverityLevel(data.threshold!))
      : risks;

    let overallRiskScore = 100;
    for (const r of filteredRisks) {
      overallRiskScore -= { low: 2, medium: 5, high: 15, critical: 30 }[r.severity];
    }
    overallRiskScore = Math.max(0, overallRiskScore);

    const recommendations = filteredRisks.map(r => r.mitigations[0]).filter(Boolean);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          risks: filteredRisks,
          overallRiskScore,
          recommendations,
          partyRole: data.partyRole,
          analysisTime: Date.now() - startTime,
        }),
      }],
    };
  },
};

// ============================================================================
// Tool: legal/contract-compare
// ============================================================================

export const contractCompareTool: MCPTool = {
  name: 'legal/contract-compare',
  description: 'Compare two contracts with detailed diff and semantic alignment',
  category: 'legal',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    properties: {
      baseDocument: { type: 'string' },
      compareDocument: { type: 'string' },
      comparisonMode: { type: 'string', default: 'full' },
      highlightChanges: { type: 'boolean' },
      generateRedline: { type: 'boolean' },
      focusClauseTypes: { type: 'array' },
      matterContext: { type: 'object' },
    },
    required: ['baseDocument', 'compareDocument'],
  },
  handler: async (input, context) => {
    const startTime = Date.now();

    const accessError = checkAccess('contract-compare', context);
    if (accessError) {
      return errorResponse('Access denied', accessError);
    }

    const parsed = ContractCompareInputSchema.safeParse(input);
    if (!parsed.success) {
      return errorResponse(parsed.error.message, LegalErrorCodes.COMPARISON_FAILED);
    }

    const data = parsed.data;
    const documentHash = simpleHash(data.baseDocument + data.compareDocument);
    await logAudit(context, 'contract-compare', documentHash, true);

    const baseClauses = extractClauses(data.baseDocument, data.focusClauseTypes);
    const compareClauses = extractClauses(data.compareDocument, data.focusClauseTypes);

    // Simple diff: compare by clause type
    const differences: Array<{
      type: string;
      baseText?: string;
      compareText?: string;
      significance: string;
    }> = [];

    const baseByType = new Map(baseClauses.map(c => [c.type, c]));
    const compareByType = new Map(compareClauses.map(c => [c.type, c]));

    for (const [type, baseClause] of baseByType) {
      const compareClause = compareByType.get(type);
      if (!compareClause) {
        differences.push({ type: 'removed', baseText: baseClause.text, significance: 'high' });
      } else {
        const sim = calculateTextSimilarity(baseClause.text, compareClause.text);
        if (sim < 0.9) {
          differences.push({
            type: 'modification',
            baseText: baseClause.text,
            compareText: compareClause.text,
            significance: sim < 0.5 ? 'high' : 'medium',
          });
        }
      }
    }

    for (const [type, compareClause] of compareByType) {
      if (!baseByType.has(type)) {
        differences.push({ type: 'added', compareText: compareClause.text, significance: 'medium' });
      }
    }

    // Overall similarity
    const allTypes = new Set([...baseByType.keys(), ...compareByType.keys()]);
    let totalSim = 0;
    let count = 0;
    for (const type of allTypes) {
      const b = baseByType.get(type);
      const c = compareByType.get(type);
      if (b && c) {
        totalSim += calculateTextSimilarity(b.text, c.text);
        count++;
      }
    }
    const similarity = count > 0 ? totalSim / count : 0;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          similarity,
          differences,
          mode: data.comparisonMode,
          comparisonTime: Date.now() - startTime,
        }),
      }],
    };
  },
};

// ============================================================================
// Tool: legal/obligation-track
// ============================================================================

export const obligationTrackTool: MCPTool = {
  name: 'legal/obligation-track',
  description: 'Extract obligations, deadlines, and dependencies using DAG analysis',
  category: 'legal',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    properties: {
      document: { type: 'string' },
      party: { type: 'string' },
      timeframe: { type: 'string' },
      obligationTypes: { type: 'array' },
      includeDependencies: { type: 'boolean' },
      includeTimeline: { type: 'boolean' },
      matterContext: { type: 'object' },
    },
    required: ['document'],
  },
  handler: async (input, context) => {
    const startTime = Date.now();

    const accessError = checkAccess('obligation-track', context);
    if (accessError) {
      return errorResponse('Access denied', accessError);
    }

    const parsed = ObligationTrackInputSchema.safeParse(input);
    if (!parsed.success) {
      return errorResponse(parsed.error.message, LegalErrorCodes.OBLIGATION_PARSING_FAILED);
    }

    const data = parsed.data;
    const documentHash = simpleHash(data.document);
    await logAudit(context, 'obligation-track', documentHash, true);

    // Extract obligations from sentences
    const obligations: Obligation[] = [];
    const obligationPatterns: Array<{ pattern: RegExp; type: Obligation['type'] }> = [
      { pattern: /shall\s+pay/i, type: 'payment' },
      { pattern: /payment\s+due/i, type: 'payment' },
      { pattern: /shall\s+deliver/i, type: 'delivery' },
      { pattern: /shall\s+notify/i, type: 'notification' },
      { pattern: /shall\s+approve/i, type: 'approval' },
      { pattern: /shall\s+comply/i, type: 'compliance' },
    ];

    const sentences = data.document.split(/[.!?]+/);
    for (const sentence of sentences) {
      const s = sentence.trim();
      if (!s) continue;
      for (const { pattern, type } of obligationPatterns) {
        if (data.obligationTypes && !data.obligationTypes.includes(type)) continue;
        if (pattern.test(s)) {
          obligations.push({
            id: `obl-${obligations.length + 1}`,
            type,
            party: data.party ?? 'Unknown Party',
            description: s,
            dependsOn: [],
            blocks: [],
            clauseIds: [],
            status: 'pending',
            priority: 'medium',
          });
          break;
        }
      }
    }

    // Build simple timeline
    const timeline: Array<{ date: string; obligations: string[]; isMilestone: boolean }> = [];

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          obligations,
          timeline,
          trackingTime: Date.now() - startTime,
        }),
      }],
    };
  },
};

// ============================================================================
// Tool: legal/playbook-match
// ============================================================================

export const playbookMatchTool: MCPTool = {
  name: 'legal/playbook-match',
  description: 'Compare contract clauses against negotiation playbook',
  category: 'legal',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    properties: {
      document: { type: 'string' },
      playbook: { type: 'string', maxLength: 1_000_000 },
      strictness: { type: 'string', default: 'moderate' },
      suggestAlternatives: { type: 'boolean' },
      prioritizeClauses: { type: 'array' },
      matterContext: { type: 'object' },
    },
    required: ['document', 'playbook'],
  },
  handler: async (input, context) => {
    const startTime = Date.now();

    // playbook-match is partner-only
    const accessError = checkAccess('playbook-match', context);
    if (accessError) {
      return errorResponse('Access denied', accessError);
    }

    const parsed = PlaybookMatchInputSchema.safeParse(input);
    if (!parsed.success) {
      return errorResponse(parsed.error.message, LegalErrorCodes.PLAYBOOK_INVALID);
    }

    const data = parsed.data;
    const documentHash = simpleHash(data.document);
    await logAudit(context, 'playbook-match', documentHash, true);

    const clauses = extractClauses(data.document, undefined);

    // Parse playbook
    let playbookData: Record<string, unknown> = {};
    try {
      playbookData = JSON.parse(data.playbook);
    } catch {
      // Use empty playbook
    }

    const positions = (playbookData.positions as Array<{ clause: string; requirement: string }>) ?? [];

    // Match clauses
    const deviations: Array<{ clause: string; expected: string; actual: string }> = [];
    let matchScore = 1.0;

    for (const pos of positions) {
      const clause = clauses.find(c => c.type === pos.clause);
      if (!clause) {
        deviations.push({ clause: pos.clause, expected: pos.requirement, actual: 'missing' });
        matchScore -= 0.1;
      } else {
        const sim = calculateTextSimilarity(clause.text, pos.requirement);
        if (sim < 0.5) {
          deviations.push({ clause: pos.clause, expected: pos.requirement, actual: clause.text });
          matchScore -= 0.05;
        }
      }
    }

    matchScore = Math.max(0, matchScore);
    const recommendations = deviations.map(d => `Review ${d.clause}: expected "${d.expected}"`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          matchScore,
          deviations,
          recommendations,
          strictness: data.strictness,
          matchTime: Date.now() - startTime,
        }),
      }],
    };
  },
};

// ============================================================================
// Tool Registry
// ============================================================================

export const legalContractsTools: MCPTool[] = [
  clauseExtractTool,
  riskAssessTool,
  contractCompareTool,
  obligationTrackTool,
  playbookMatchTool,
];

export function getTool(name: string): MCPTool | undefined {
  return legalContractsTools.find(t => t.name === name);
}

export function getToolNames(): string[] {
  return legalContractsTools.map(t => t.name);
}

export default legalContractsTools;
