-- CreateIndex
CREATE INDEX "AgendaItem_meetingId_idx" ON "AgendaItem"("meetingId");

-- CreateIndex
CREATE INDEX "Meeting_spaceId_idx" ON "Meeting"("spaceId");

-- CreateIndex
CREATE INDEX "OrganisationMember_userId_idx" ON "OrganisationMember"("userId");

-- CreateIndex
CREATE INDEX "Output_itemId_idx" ON "Output"("itemId");

-- CreateIndex
CREATE INDEX "Space_organisationId_idx" ON "Space"("organisationId");
