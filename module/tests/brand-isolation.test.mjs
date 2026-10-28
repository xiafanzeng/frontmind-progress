import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monitoringMetrics, emptyMonitoringEvidence, monitoringSubjectContribution, monitoringCompetitorAnalysisItems } from '../dist/server/read-helpers.js';
import { analyzeSentiment } from '../dist/shared/overviewAnalysis.js';
import { taskConfigurationSchema } from '../dist/contracts/monitor-configuration.js';

const fact = (id, overrides = {}) => ({
  attemptId: id, runId: id, runCreatedAt: new Date('2026-10-27T00:00:00Z'), questionId: 'question', platformId: 'platform',
  status: 'completed', revisionId: id, hasNonEmptyAnswer: true, sentiment: 'positive',
  brandMentioned: true, mentionPosition: 1, competitorRankings: [], monitorCompetitors: [],
  citationProvenanceHint: 'explicit', hasLegacyCitationList: false, revisionCreatedAt: null, ...overrides,
});

test('old-brand results remain in collection totals but cannot alter current-brand metrics', () => {
  const old = fact('old', { selfBrandMatches: false, sentiment: 'negative' });
  const current = fact('current', { selfBrandMatches: true, brandMentioned: false, mentionPosition: null, sentiment: 'neutral' });
  const metrics = monitoringMetrics([old, current], emptyMonitoringEvidence(), { kind: 'self' });
  assert.equal(metrics.answers, 2);
  assert.equal(metrics.mentionedAnswers, 0);
  assert.equal(metrics.mentionRate, 0);
  assert.equal(metrics.averagePosition, null);
  assert.equal(metrics.top3Rate, 0);
  assert.deepEqual(metrics.sentiments, { positive: 0, neutral: 1, negative: 0, unknown: 1 });
  const missing = monitoringMetrics([old], emptyMonitoringEvidence(), { kind: 'self' });
  assert.equal(missing.mentionRate, null);
  assert.equal(missing.top3Rate, null);
  assert.equal(missing.averagePosition, null);
});

test('a newly assigned alias cannot rebind a historical competitor', () => {
  const current = { name: 'Current competitor', aliases: ['Old competitor'] };
  const old = fact('old', { monitorCompetitors: [{ name: 'Old competitor', aliases: [] }], competitorRankings: [{ name: 'Old competitor', mentioned: true, position: 1 }] });
  assert.deepEqual(monitoringSubjectContribution(old, { kind: 'competitor', ...current }), { mentioned: false, position: null });
  assert.equal(monitoringCompetitorAnalysisItems([old], [current])[0].answerCount, 0);
  assert.equal(monitoringCompetitorAnalysisItems([old], [current])[0].mentionRate, null);
});

test('same configured competitor uses that run’s aliases and its own eligible denominator', () => {
  const subject = { kind: 'competitor', name: 'Competitor', aliases: ['New alias'] };
  const eligible = fact('eligible', { monitorCompetitors: [{ name: 'Competitor', aliases: ['Historical alias'] }], competitorRankings: [{ name: 'Historical alias', mentioned: true, position: 2 }] });
  const unconfigured = fact('unconfigured');
  const metrics = monitoringMetrics([eligible, unconfigured], emptyMonitoringEvidence(), subject);
  assert.equal(metrics.answers, 2);
  assert.equal(metrics.mentionRate, 1);
  assert.equal(metrics.averagePosition, 2);
  assert.equal(monitoringCompetitorAnalysisItems([eligible, unconfigured], [subject])[0].answerCount, 1);
});

test('historical own-brand words cannot populate the current brand cloud', () => {
  const result = analyzeSentiment([{ answerId: 'old', runId: 'old', questionId: 'q', question: 'q', platformName: 'p', capturedAt: '2026-10-27', revisionId: 'r', revision: 1, targetBrand: 'Old brand', sentiment: 'positive', keywordState: 'available', evaluations: [{ keyword: 'good', nature: 'positive', context: 'old evidence' }] }], 'Current brand', { answerTone: 'all', keywordTone: 'all', keywordKey: null, page: 1 }, '');
  assert.equal(result.total, 1);
  assert.equal(result.classified, 0);
  assert.equal(result.missing, 1);
  assert.equal(result.brandMismatch, 1);
  assert.deepEqual(result.keywords, []);
});

test('task configuration requires an explicit monitored brand independently of its name', () => {
  const config = { name: 'Weekly monitoring', brandAliases: [], competitors: [], questions: ['How is the brand?'], platforms: [{ platformId: '00000000-0000-4000-8000-000000000001', providerCode: 'deepseek', clientType: 'web', mode: 'search', screenshot: 0, regionCode: null }], repetitions: 1, schedule: { type: 'none', timezone: 'Asia/Shanghai', localTime: '09:00', weekday: null } };
  assert.equal(taskConfigurationSchema.safeParse(config).success, false);
  assert.equal(taskConfigurationSchema.safeParse({ ...config, mainBrand: '  ' }).success, false);
  const parsed = taskConfigurationSchema.parse({ ...config, mainBrand: ' Actual brand ' });
  assert.equal(parsed.mainBrand, 'Actual brand');
  assert.equal(parsed.name, 'Weekly monitoring');
});
