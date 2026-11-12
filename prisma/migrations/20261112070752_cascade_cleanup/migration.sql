-- DropForeignKey
ALTER TABLE "evidence_records" DROP CONSTRAINT "evidence_records_result_id_fkey";

-- DropForeignKey
ALTER TABLE "evidence_records" DROP CONSTRAINT "evidence_records_verification_run_id_fkey";

-- DropForeignKey
ALTER TABLE "form_captures" DROP CONSTRAINT "form_captures_deliverable_id_fkey";

-- DropForeignKey
ALTER TABLE "verification_results" DROP CONSTRAINT "verification_results_criterion_id_fkey";

-- DropForeignKey
ALTER TABLE "verification_runs" DROP CONSTRAINT "verification_runs_deliverable_id_fkey";

-- AddForeignKey
ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "deliverables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_results" ADD CONSTRAINT "verification_results_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "acceptance_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_verification_run_id_fkey" FOREIGN KEY ("verification_run_id") REFERENCES "verification_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "verification_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_captures" ADD CONSTRAINT "form_captures_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "deliverables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
