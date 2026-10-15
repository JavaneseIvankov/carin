// Generated from specs/contracts/. Do not edit; run pnpm contracts:generate in carin-app.
export const appOperations = {
  completeOnboarding: {
    method: 'POST',
    path: '/api/v1/onboarding/complete',
    contentType: null,
  },
  correctScan: {
    method: 'POST',
    path: '/api/v1/scans/{id}/corrections',
    contentType: 'application/json',
  },
  createConsumption: {
    method: 'POST',
    path: '/api/v1/consumptions',
    contentType: 'application/json',
  },
  createExamination: {
    method: 'POST',
    path: '/api/v1/examinations',
    contentType: 'application/json',
  },
  createPhotoAnalysis: {
    method: 'POST',
    path: '/api/v1/analysis-jobs',
    contentType: 'application/json',
  },
  deleteAccount: {
    method: 'POST',
    path: '/api/v1/account-deletion',
    contentType: 'application/json',
  },
  deleteConsumption: {
    method: 'DELETE',
    path: '/api/v1/consumptions/{id}',
    contentType: null,
  },
  deleteExamination: {
    method: 'DELETE',
    path: '/api/v1/examinations/{id}',
    contentType: null,
  },
  deleteScan: {
    method: 'DELETE',
    path: '/api/v1/scans/{id}',
    contentType: null,
  },
  getAnalysisJob: {
    method: 'GET',
    path: '/api/v1/analysis-jobs/{id}',
    contentType: null,
  },
  getAnalysisResult: {
    method: 'GET',
    path: '/api/v1/analysis-results/{id}',
    contentType: null,
  },
  getConditions: {
    method: 'GET',
    path: '/api/v1/catalog/conditions',
    contentType: null,
  },
  getConsumption: {
    method: 'GET',
    path: '/api/v1/consumptions/{id}',
    contentType: null,
  },
  getDashboard: {
    method: 'GET',
    path: '/api/v1/dashboard',
    contentType: null,
  },
  getExamination: {
    method: 'GET',
    path: '/api/v1/examinations/{id}',
    contentType: null,
  },
  getExaminationSeries: {
    method: 'GET',
    path: '/api/v1/examination-series',
    contentType: null,
  },
  getLegalRegistry: {
    method: 'GET',
    path: '/api/v1/legal',
    contentType: null,
  },
  getLiveness: {
    method: 'GET',
    path: '/health/live',
    contentType: null,
  },
  getMe: {
    method: 'GET',
    path: '/api/v1/me',
    contentType: null,
  },
  getOnboarding: {
    method: 'GET',
    path: '/api/v1/onboarding',
    contentType: null,
  },
  getPhotoView: {
    method: 'GET',
    path: '/api/v1/photos/{id}/view',
    contentType: null,
  },
  getProfile: {
    method: 'GET',
    path: '/api/v1/profile',
    contentType: null,
  },
  getReadiness: {
    method: 'GET',
    path: '/health/ready',
    contentType: null,
  },
  getScan: {
    method: 'GET',
    path: '/api/v1/scans/{id}',
    contentType: null,
  },
  listConsumptions: {
    method: 'GET',
    path: '/api/v1/consumptions',
    contentType: null,
  },
  listExaminations: {
    method: 'GET',
    path: '/api/v1/examinations',
    contentType: null,
  },
  listScans: {
    method: 'GET',
    path: '/api/v1/scans',
    contentType: null,
  },
  readSignedPhoto: {
    method: 'GET',
    path: '/media/photos/{photoId}',
    contentType: null,
  },
  retryAnalysisJob: {
    method: 'POST',
    path: '/api/v1/analysis-jobs/{id}/retry',
    contentType: null,
  },
  searchFoods: {
    method: 'GET',
    path: '/api/v1/catalog/foods',
    contentType: null,
  },
  setAiConsent: {
    method: 'PUT',
    path: '/api/v1/consents/ai-processing',
    contentType: 'application/json',
  },
  updateConsumption: {
    method: 'PATCH',
    path: '/api/v1/consumptions/{id}',
    contentType: 'application/json',
  },
  updateExamination: {
    method: 'PATCH',
    path: '/api/v1/examinations/{id}',
    contentType: 'application/json',
  },
  updateMe: {
    method: 'PATCH',
    path: '/api/v1/me',
    contentType: 'application/json',
  },
  updateProfile: {
    method: 'PATCH',
    path: '/api/v1/profile',
    contentType: 'application/json',
  },
  uploadPhoto: {
    method: 'POST',
    path: '/api/v1/photos',
    contentType: 'multipart/form-data',
  },
} as const;
