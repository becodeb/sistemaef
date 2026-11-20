CREATE TABLE "jump_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"discipline_id" uuid NOT NULL,
	"taken_on" date NOT NULL,
	"round" smallint NOT NULL,
	"height" double precision NOT NULL,
	"seq" smallint NOT NULL,
	"result" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "disciplines" ADD COLUMN "heights" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jump_attempts" ADD CONSTRAINT "jump_attempts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jump_attempts" ADD CONSTRAINT "jump_attempts_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jump_attempts" ADD CONSTRAINT "jump_attempts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jump_attempts_key" ON "jump_attempts" USING btree ("batch_id","student_id","round","seq");--> statement-breakpoint
CREATE INDEX "jump_attempts_student" ON "jump_attempts" USING btree ("student_id","discipline_id");--> statement-breakpoint
-- La disciplina base de salto en alto pasa a tomarse por alturas (un admin lo puede cambiar en Disciplinas).
UPDATE "disciplines" SET "heights" = true WHERE "name" = 'Salto en alto';
