-- Acelera contagens/filtros por direção (mensagens da loja vs do lead).
CREATE INDEX "WaMessage_connectionId_direction_timestamp_idx" ON "WaMessage"("connectionId", "direction", "timestamp");
