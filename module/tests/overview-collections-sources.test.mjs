import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monitoringMetrics, emptyMonitoringEvidence } from '../dist/server/read-helpers.js';
import { citationPage } from '../dist/shared/overviewAnalysis.js';
import { classifyOverviewSource } from '../dist/shared/sourceClassification.js';
import { overviewSourcesOutputSchema } from '../dist/contracts/overview.js';

const fact = (id, runId, mentioned, extra = {}) => ({
  attemptId: id, runId, runStatus: 'completed', runCreatedAt: new Date('2026-11-01T00:00:00Z'),
  questionId: 'question', platformId: 'model', status: 'completed', revisionId: id,
  hasNonEmptyAnswer: true, selfBrandMatches: true, brandMentioned: mentioned,
  mentionPosition: mentioned ? 2 : null, sentiment: null, competitorRankings: [], monitorCompetitors: [],
  citationProvenanceHint: 'explicit', hasLegacyCitationList: false, revisionCreatedAt: null, ...extra,
});
test('summary counts each eligible completed collection once, independent of repetitions', () => {
  const facts = [fact('a', 'first', true), fact('b', 'first', false), fact('c', 'first', false), fact('d', 'second', false)];
  const metrics = monitoringMetrics(facts, emptyMonitoringEvidence(), { kind: 'self' }, 'runs');
  assert.equal(metrics.mentionRate, 0.5);
  assert.equal(metrics.top3Rate, 0.5);
  assert.equal(metrics.triggeredRuns, 2);
  assert.equal(metrics.mentionedRuns, 1);
  assert.equal(metrics.top3Runs, 1);
  const answerMetrics = monitoringMetrics(facts, emptyMonitoringEvidence(), { kind: 'self' });
  assert.equal(answerMetrics.mentionRate, 0.25);
  assert.equal(answerMetrics.top3Rate, 0.25);
});
test('incomplete, empty, failed and different-brand facts cannot inflate collection rates', () => {
  const excluded = [fact('old', 'old', true, { selfBrandMatches: false }),
    fact('pending', 'pending', true, { runStatus: 'running' }),
    fact('empty', 'empty', true, { hasNonEmptyAnswer: false }),
    fact('failed', 'failed', true, { status: 'failed' })];
  const metrics = monitoringMetrics(excluded, emptyMonitoringEvidence(), { kind: 'self' }, 'runs');
  assert.equal(metrics.triggeredRuns, 0);
  assert.equal(metrics.mentionRate, null);
  assert.equal(metrics.top3Rate, null);
  const competitor = monitoringMetrics([fact('a', 'r', false, {
    monitorCompetitors: [{ name: '历史竞品', aliases: ['别名'] }],
    competitorRankings: [{ name: '别名', mentioned: true, position: 3 }],
  })], emptyMonitoringEvidence(), { kind: 'competitor', name: '历史竞品', aliases: [] }, 'runs');
  assert.equal(competitor.mentionRate, 1);
  assert.equal(competitor.top3Rate, 1);
});
test('overview classifier covers seeds, institutional suffixes, brand aliases and hostname boundaries', () => {
  for (const host of ['zhihu.com', 'zhuanlan.zhihu.com', 'wikipedia.org', 'csdn.net']) assert.equal(classifyOverviewSource(host), 'knowledge');
  for (const host of ['admissions.cuhk.edu.cn', 'career.cuhk.edu.hk', 'cscse.edu.cn', 'longdameishi.com', 'example.gov.cn']) assert.equal(classifyOverviewSource(host), 'official');
  for (const host of ['stcn.com', 'eastmoney.com', 'cs.com.cn']) assert.equal(classifyOverviewSource(host), 'news');
  assert.equal(classifyOverviewSource('bilibili.com'), 'social');
  assert.equal(classifyOverviewSource('jd.com'), 'commerce');
  assert.equal(classifyOverviewSource('example.org', '目标品牌官网', ['目标品牌']), 'official');
  assert.equal(classifyOverviewSource('zhihu.com.example.org'), 'other');
  assert.equal(classifyOverviewSource('unknown.example'), 'other');
});
test('both rankings paginate by five while full-scope classification and website names remain stable', () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({ title: `内容${index}`, url: `https://site${index}.example/article`, domain: `site${index}.example`, siteName: `网站${index}` }));
  rows.push({ title: '知乎内容', url: 'https://zhihu.com/question/1#first', domain: 'zhihu.com', siteName: '知乎' });
  rows.push({ title: '知乎内容', url: 'https://zhihu.com/question/1#second', domain: 'zhihu.com', siteName: null });
  const allSources = [...rows, { title: '未引用来源', url: 'https://stcn.com/article', domain: 'stcn.com' }];
  const first = citationPage(rows, { domain: null, domainPage: 1, contentPage: 1 }, '范围', [], allSources);
  assert.equal(overviewSourcesOutputSchema.safeParse(first).success, true);
  assert.equal(first.pageSize, 5);
  assert.equal(first.domains.length, 5);
  assert.equal(first.contents.length, 5);
  assert.equal(first.contents[0].siteName, '知乎');
  assert.equal(first.contents[0].count, 2);
  assert.equal(first.contents[0].category, 'knowledge');
  assert.equal(first.typeCounts.reduce((sum, item) => sum + item.count, 0), 15);
  const last = citationPage(rows, { domain: null, domainPage: 99, contentPage: 99 }, '范围', [], allSources);
  assert.equal(last.domainPage, 3);
  assert.equal(last.contentPage, 3);
  assert.equal(last.domains.length, 3);
  assert.equal(last.contents.length, 3);
  const filtered = citationPage(rows, { domain: 'zhihu.com', domainPage: 2, contentPage: 99 }, '范围', [], allSources);
  assert.equal(filtered.contentPage, 1);
  assert.equal(filtered.contents.length, 1);
  assert.deepEqual(filtered.typeCounts, first.typeCounts);
});
