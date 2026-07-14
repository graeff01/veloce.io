-- Link direto de avaliação no Google, por cliente (usado na página /r/<token>/avaliar).
ALTER TABLE "Client" ADD COLUMN "googleReviewUrl" TEXT;
