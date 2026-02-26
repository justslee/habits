import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import CheckInScreen from '../src/screens/CheckInScreen';

// Mock the API client
jest.mock('../src/api/client', () => ({
  createEntry: jest.fn(),
  suggestTags: jest.fn(),
}));

const { createEntry, suggestTags } = require('../src/api/client');

beforeEach(() => {
  jest.clearAllMocks();
  createEntry.mockResolvedValue({ id: 1 });
  suggestTags.mockResolvedValue({ suggestions: [] });
});

describe('CheckInScreen', () => {
  it('renders all form fields', () => {
    const { getByTestId, getByText } = render(<CheckInScreen />);
    expect(getByTestId('description-input')).toBeTruthy();
    expect(getByTestId('hours-input')).toBeTruthy();
    expect(getByTestId('minutes-input')).toBeTruthy();
    expect(getByTestId('takeaway-input')).toBeTruthy();
    expect(getByTestId('submit-btn')).toBeTruthy();
    // All 5 pillar chips
    for (let i = 1; i <= 5; i++) {
      expect(getByTestId(`pillar-${i}`)).toBeTruthy();
    }
    // Difficulty and energy dots
    expect(getByTestId('difficulty-5')).toBeTruthy();
    expect(getByTestId('energy-5')).toBeTruthy();
  });

  it('validates required fields before submit', () => {
    const { getByTestId } = render(<CheckInScreen />);
    fireEvent.press(getByTestId('submit-btn'));
    // createEntry should NOT be called with empty form
    expect(createEntry).not.toHaveBeenCalled();
  });

  it('submits form with correct payload', async () => {
    const { getByTestId } = render(<CheckInScreen />);

    fireEvent.changeText(getByTestId('description-input'), 'Studied measure theory');
    fireEvent.changeText(getByTestId('hours-input'), '1');
    fireEvent.changeText(getByTestId('minutes-input'), '30');
    fireEvent.press(getByTestId('pillar-1')); // Quant Finance
    fireEvent.press(getByTestId('pillar-3')); // ML Math
    fireEvent.press(getByTestId('difficulty-8'));
    fireEvent.press(getByTestId('energy-7'));
    fireEvent.changeText(getByTestId('takeaway-input'), 'Sigma algebras clicked');

    await act(async () => {
      fireEvent.press(getByTestId('submit-btn'));
    });

    await waitFor(() => {
      expect(createEntry).toHaveBeenCalledWith({
        description: 'Studied measure theory',
        time_invested_minutes: 90,
        pillar_tags: [1, 3],
        difficulty_rating: 8,
        energy_level: 7,
        key_takeaway: 'Sigma algebras clicked',
      });
    });
  });

  it('shows success screen after submission', async () => {
    const { getByTestId, getByText } = render(<CheckInScreen />);

    fireEvent.changeText(getByTestId('description-input'), 'Built a vol model');
    fireEvent.changeText(getByTestId('hours-input'), '2');
    fireEvent.changeText(getByTestId('takeaway-input'), 'SABR is elegant');

    await act(async () => {
      fireEvent.press(getByTestId('submit-btn'));
    });

    await waitFor(() => {
      expect(getByText('Logged!')).toBeTruthy();
      expect(getByText('Log Another')).toBeTruthy();
    });
  });

  it('toggles pillar selection', () => {
    const { getByTestId } = render(<CheckInScreen />);
    const chip = getByTestId('pillar-2');

    // Select
    fireEvent.press(chip);
    // Deselect
    fireEvent.press(chip);
    // Re-select
    fireEvent.press(chip);
    // Just verifying no crash — visual state tested by snapshot or manual
  });

  it('resets form on "Log Another"', async () => {
    const { getByTestId, getByText } = render(<CheckInScreen />);

    fireEvent.changeText(getByTestId('description-input'), 'Test entry');
    fireEvent.changeText(getByTestId('hours-input'), '1');
    fireEvent.changeText(getByTestId('takeaway-input'), 'Test takeaway');

    await act(async () => {
      fireEvent.press(getByTestId('submit-btn'));
    });

    await waitFor(() => {
      expect(getByText('Log Another')).toBeTruthy();
    });

    fireEvent.press(getByText('Log Another'));

    // Should be back to form
    expect(getByTestId('description-input')).toBeTruthy();
  });
});
