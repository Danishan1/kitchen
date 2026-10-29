import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App } from '../src/App';

// jsdom lacks <dialog> methods
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open');
};

describe('App (smoke)', () => {
  it('boots with seed data and navigates to recipes', async () => {
    window.location.hash = '#/';
    render(<App />);
    await waitFor(() => expect(screen.getAllByText(/Today’s meals/).length).toBeGreaterThan(0), { timeout: 4000 });
    window.location.hash = '#/recipes';
    await waitFor(() => expect(screen.getByText('Chicken biryani (home dum)')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value: 'bhindi' } });
    await waitFor(() => expect(screen.queryByText('Chicken biryani (home dum)')).toBeNull());
    expect(screen.getByText('Bhindi sabzi (dry)')).toBeTruthy();
  });
});
