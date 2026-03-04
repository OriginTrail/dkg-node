#!/usr/bin/env tsx

import { evaluate, defaultMetrics, RagasDataset } from "./ragas-node";
import * as fs from "fs";
import * as path from "path";
import { RagasConfig, defaultRagasConfig } from "./config";
import { defaultLLMClient } from "./llm-client";
import { DkgNodeWebClient, defaultDkgNodeWebConfig } from "./dkg-node-client";

// Load environment variables (same as DKG Node does)
import dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env.development.local") });

class DkgNodeRagasEvaluator {
  private config: RagasConfig;
  private dataset: RagasDataset | null = null;
  private dkgNodeClient: DkgNodeWebClient;

  constructor(config: RagasConfig = defaultRagasConfig) {
    this.config = config;
    this.dkgNodeClient = new DkgNodeWebClient(defaultDkgNodeWebConfig);
  }

  async loadDataset(datasetPath: string): Promise<void> {
    try {
      const data = JSON.parse(fs.readFileSync(datasetPath, "utf-8"));

      // Convert to RAGAS format
      this.dataset = {
        question: data.question,
        answer: data.answer,
        contexts: data.contexts,
        ground_truths: data.ground_truths,
      };

      // Dataset loaded successfully
    } catch (error) {
      console.error(`❌ Error loading dataset: ${error}`);
      throw error;
    }
  }

  async generateDkgNodeAnswers(questions: string[]): Promise<string[]> {
    try {
      // Initialize web browser connection
      await this.dkgNodeClient.initialize();

      // Ask all questions through the web interface
      const answers = await this.dkgNodeClient.askMultipleQuestions(questions);

      // Successfully got responses from DKG Node
      return answers;
    } catch (error) {
      console.error("❌ Error with web interface:", error);
      console.error(
        "🚫 RAGAS evaluation FAILED - Cannot connect to DKG Node web interface!",
      );
      console.error("🔧 Please ensure:");
      console.error(
        "   1. DKG Node frontend is running at http://localhost:8081",
      );
      console.error(
        "   2. DKG Node backend is running at http://localhost:9200",
      );
      console.error("   3. Admin user exists with correct credentials");
      console.error(
        "   4. All required testID attributes are present in UI components",
      );

      throw new Error(
        `DKG Node web interface connection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      // Always close the browser
      await this.dkgNodeClient.close();
    }
  }

  async evaluateDataset(): Promise<any> {
    if (!this.dataset) {
      throw new Error("Dataset not loaded. Call loadDataset() first.");
    }

    console.log("📊 Starting RAGAS evaluation...");

    // Generate live answers from DKG Node
    const liveAnswers = await this.generateDkgNodeAnswers(
      this.dataset.question,
    );

    // Create evaluation dataset with live answers
    const liveDataset = {
      question: this.dataset.question,
      answer: liveAnswers,
      contexts: this.dataset.contexts,
      ground_truths: this.dataset.ground_truths, // Use manual ground truth answers for comparison
    };

    // Generated live responses from DKG Node

    // Use default metrics for now (can be extended to support custom metric selection)
    const selectedMetrics = defaultMetrics;

    // Using default RAGAS metrics

    try {
      const scores = await evaluate(liveDataset, selectedMetrics, {
        maxConcurrency: this.config.batchSize,
        maxRetries: this.config.maxRetries,
      });

      // Add detailed failure analysis
      const detailedResults = this.analyzeFailures(liveDataset, scores);

      return {
        scores: scores,
        detailedResults: detailedResults,
        dataset: liveDataset,
      };
    } catch (error) {
      console.error(`❌ Error during evaluation: ${error}`);
      throw error;
    }
  }

  private analyzeFailures(dataset: any, scores: any): any {
    const failures: any[] = [];
    const thresholds = this.config.thresholds as any;

    // Analyze each question for failures
    for (let i = 0; i < dataset.question.length; i++) {
      const question = dataset.question[i];
      const dkgAnswer = dataset.answer[i];
      const expectedAnswer =
        dataset.ground_truths[i] || "No expected answer provided";
      const context = dataset.contexts[i]?.join(" ") || "No context provided";

      const questionFailures: any = {
        questionIndex: i + 1,
        question: question,
        dkgAnswer: dkgAnswer,
        expectedAnswer: expectedAnswer,
        context: context,
        failedMetrics: [],
        passedMetrics: [],
      };

      // Check each metric for this question
      for (const [metricName, score] of Object.entries(scores)) {
        const threshold = thresholds[metricName] || 0.8;
        const passed = (score as number) >= threshold;

        if (passed) {
          questionFailures.passedMetrics.push({
            metric: metricName,
            score: (score as number).toFixed(3),
            threshold: threshold,
          });
        } else {
          questionFailures.failedMetrics.push({
            metric: metricName,
            score: (score as number).toFixed(3),
            threshold: threshold,
            gap: (threshold - (score as number)).toFixed(3),
          });
        }
      }

      // Only include questions that have failures
      if (questionFailures.failedMetrics.length > 0) {
        failures.push(questionFailures);
      }
    }

    return {
      totalQuestions: dataset.question.length,
      failedQuestions: failures.length,
      passedQuestions: dataset.question.length - failures.length,
      failures: failures,
    };
  }

  private generateSummary(scores: any): any {
    const summary: any = {
      overall: {},
      byMetric: {},
      passed: 0,
      failed: 0,
      total: 0,
    };

    for (const [metricName, score] of Object.entries(scores)) {
      const threshold = (this.config.thresholds as any)[metricName] || 0.8;
      const passed = (score as number) >= threshold;

      summary.byMetric[metricName] = {
        score: score,
        threshold: threshold,
        passed: passed,
        status: passed ? "PASS" : "FAIL",
      };

      if (passed) summary.passed++;
      else summary.failed++;
      summary.total++;
    }

    // Calculate overall score
    const metricScores = Object.values(summary.byMetric);
    const totalScore = metricScores.reduce(
      (sum: number, metricData: any) => sum + metricData.score,
      0,
    );
    summary.overall.averageScore =
      totalScore / Object.keys(summary.byMetric).length;
    summary.overall.passRate = summary.passed / summary.total;

    return summary;
  }

  private generateRecommendations(scores: any): string[] {
    const recommendations: string[] = [];

    for (const [metricName, score] of Object.entries(scores)) {
      const threshold = (this.config.thresholds as any)[metricName] || 0.8;

      if ((score as number) < threshold) {
        switch (metricName) {
          case "context_precision":
            recommendations.push(
              "Improve context retrieval precision by refining search algorithms and relevance scoring in DKG operations",
            );
            break;
          case "context_recall":
            recommendations.push(
              "Enhance context recall by expanding knowledge base coverage and improving DKG asset retrieval strategies",
            );
            break;
          case "answer_relevance":
            recommendations.push(
              "Focus on answer relevance by better understanding user intent and providing more targeted DKG-related responses",
            );
            break;
          case "faithfulness":
            recommendations.push(
              "Improve faithfulness by ensuring answers accurately reflect retrieved DKG context without hallucination",
            );
            break;
          case "answer_similarity":
            recommendations.push(
              "Enhance answer similarity by improving DKG response generation to better match expected answers",
            );
            break;
          case "answer_correctness":
            recommendations.push(
              "Increase answer correctness by improving DKG fact-checking and blockchain verification processes",
            );
            break;
        }
      }
    }

    if (recommendations.length === 0) {
      recommendations.push(
        "All metrics are performing well! Consider monitoring for consistency and exploring advanced DKG features.",
      );
    }

    return recommendations;
  }

  private generateCSVReport(scores: any): string {
    const headers = [
      "Metric",
      "Score",
      "Threshold",
      "Status",
      "Recommendation",
    ];
    const rows = [headers.join(",")];

    for (const [metricName, score] of Object.entries(scores)) {
      const threshold = (this.config.thresholds as any)[metricName] || 0.8;
      const passed = (score as number) >= threshold;
      const status = passed ? "PASS" : "FAIL";
      const recommendation = passed ? "Good performance" : "Needs improvement";

      rows.push(
        [metricName, score, threshold, status, recommendation].join(","),
      );
    }

    return rows.join("\n");
  }

  private generateHTMLReport(report: any): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DKG Node RAGAS Evaluation Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .metric { margin: 20px 0; padding: 15px; border-radius: 5px; }
        .pass { background-color: #d4edda; border-left: 4px solid #28a745; }
        .fail { background-color: #f8d7da; border-left: 4px solid #dc3545; }
        .summary { background-color: #e2e3e5; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .recommendations { background-color: #fff3cd; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .score { font-size: 1.2em; font-weight: bold; }
        .timestamp { color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔬 DKG Node RAGAS Evaluation Report</h1>
            <p class="timestamp">Generated: ${report.timestamp}</p>
        </div>

        <div class="summary">
            <h2>📊 Summary</h2>
            <p><strong>Overall Score:</strong> ${(report.summary.overall.averageScore * 100).toFixed(1)}%</p>
            <p><strong>Pass Rate:</strong> ${(report.summary.overall.passRate * 100).toFixed(1)}% (${report.summary.passed}/${report.summary.total} metrics passed)</p>
        </div>

        <h2>📈 Metric Results</h2>
        ${Object.entries(report.summary.byMetric)
          .map(
            ([metric, data]: [string, any]) => `
            <div class="metric ${data.passed ? "pass" : "fail"}">
                <h3>${metric.replace(/_/g, " ").toUpperCase()}</h3>
                <p class="score">Score: ${(data.score * 100).toFixed(1)}% (Threshold: ${(data.threshold * 100).toFixed(1)}%)</p>
                <p><strong>Status:</strong> ${data.status}</p>
            </div>
        `,
          )
          .join("")}

        <div class="recommendations">
            <h2>💡 Recommendations</h2>
            <ul>
                ${report.recommendations.map((rec: string) => `<li>${rec}</li>`).join("")}
            </ul>
        </div>
    </div>
</body>
</html>`;
  }

  private generateDatabaseJSON(scores: any): any {
    const timestamp = new Date().toISOString();

    // Calculate overall_score as the average of all metric scores
    const metricScores = [
      scores.context_precision || 0,
      scores.context_recall || 0,
      scores.context_relevancy || 0,
      scores.answer_relevance || 0,
      scores.faithfulness || 0,
      scores.answer_similarity || 0,
      scores.answer_correctness || 0,
    ];
    const overall_score =
      metricScores.reduce((sum, score) => sum + score, 0) / metricScores.length;

    return {
      timestamp,
      overall_score,
      context_precision: scores.context_precision || 0,
      context_recall: scores.context_recall || 0,
      context_relevancy: scores.context_relevancy || 0,
      answer_relevance: scores.answer_relevance || 0,
      faithfulness: scores.faithfulness || 0,
      answer_similarity: scores.answer_similarity || 0,
      answer_correctness: scores.answer_correctness || 0,
    };
  }

  async generateReport(results: any): Promise<void> {
    const scores = results.scores;
    const summary = this.generateSummary(scores);
    const recommendations = this.generateRecommendations(scores);
    const detailedResults = results.detailedResults;

    const timestamp = new Date().toISOString();
    const timestampFormatted = timestamp.replace(/[:.]/g, "-");

    const report = {
      timestamp: timestamp,
      scores,
      summary,
      recommendations,
      detailedResults: detailedResults,
      config: {
        thresholds: this.config.thresholds,
        metrics: this.config.metrics,
      },
    };

    // Generate different report formats
    const csvReport = this.generateCSVReport(scores);
    const htmlReport = this.generateHTMLReport(report);
    const dbJson = this.generateDatabaseJSON(scores);

    // Save reports to files
    const reportsDir = path.join(__dirname, "reports");
    const evaluationDir = path.join(
      reportsDir,
      `evaluation-${timestampFormatted}`,
    );

    // Create evaluation directory
    if (!fs.existsSync(evaluationDir)) {
      fs.mkdirSync(evaluationDir, { recursive: true });
    }

    // Save main JSON report for dashboard
    const jsonReportPath = path.join(evaluationDir, "evaluation-report.json");
    fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2));

    // Save additional formats
    const csvPath = path.join(
      evaluationDir,
      `ragas-report-${timestampFormatted}.csv`,
    );
    fs.writeFileSync(csvPath, csvReport);

    const htmlPath = path.join(
      evaluationDir,
      `ragas-report-${timestampFormatted}.html`,
    );
    fs.writeFileSync(htmlPath, htmlReport);

    const dbJsonPath = path.join(__dirname, "ragas-results.json");
    fs.writeFileSync(dbJsonPath, JSON.stringify(dbJson, null, 2));

    console.log(`\n📁 Reports saved to: ${evaluationDir}`);
    console.log(`\n🎯 RAGAS Evaluation Summary:`);
    console.log(
      `Overall Score: ${(summary.overall.averageScore * 100).toFixed(1)}%`,
    );
    console.log(`Pass Rate: ${(summary.overall.passRate * 100).toFixed(1)}%`);
    console.log(`Passed Metrics: ${summary.passed}/${summary.total}`);
  }
}

// Main execution function
async function main() {
  try {
    console.log("🚀 Starting DKG Node RAGAS Evaluation...");

    // Load configuration
    const config = defaultRagasConfig;

    // Initialize evaluator
    const evaluator = new DkgNodeRagasEvaluator(config);

    // Load dataset
    const datasetPath = path.join(
      __dirname,
      "questionsAnswers",
      "dkg-node-evaluation-dataset.json",
    );
    await evaluator.loadDataset(datasetPath);

    // Run evaluation
    const results = await evaluator.evaluateDataset();

    // Generate reports
    await evaluator.generateReport(results);

    console.log("✅ DKG Node RAGAS evaluation completed successfully!");
  } catch (error) {
    console.error("❌ DKG Node RAGAS evaluation failed:", error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { DkgNodeRagasEvaluator };
