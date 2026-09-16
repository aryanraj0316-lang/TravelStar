import React from 'react';

/**
 * GlobalSosBanner is kept as a component export for layout backwards-compatibility,
 * but renders null because the explicit SOS banners have been removed from both
 * the Home tab and Chat tab per specification.
 * The SoS alert on top of the chat list is preserved in chat.tsx.
 */
export const GlobalSosBanner: React.FC = () => null;
