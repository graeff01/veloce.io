-- KommoLead.kommoId passa a representar o id do CONTATO; adiciona leadId (id do lead no funil).
ALTER TABLE "KommoLead" ADD COLUMN "leadId" INTEGER;
