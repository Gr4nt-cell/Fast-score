import React from 'react';
import { ScrollView, Text, View } from 'react-native';

/**
 * Keeps one failing screen from taking the whole app down, and shows what
 * actually went wrong — a release build otherwise just disappears, with no
 * way to tell which component threw.
 */
export default class Boundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prev) {
    // a new screen gets a clean slate
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80 }}>
        <Text style={{ color: '#FF453A', fontSize: 20, fontWeight: '700', marginBottom: 10 }}>
          This screen hit a problem
        </Text>
        <Text selectable style={{ color: '#8E8E93', fontSize: 13, marginBottom: 16 }}>
          The rest of the app still works — switch tabs to carry on. Details below.
        </Text>
        <View style={{ backgroundColor: 'rgba(127,127,127,0.18)', borderRadius: 12, padding: 12 }}>
          <Text selectable style={{ color: '#C7C7CC', fontSize: 12, fontFamily: 'monospace' }}>
            {String((error && error.message) || error)}
            {error && error.stack ? `\n\n${String(error.stack).split('\n').slice(0, 12).join('\n')}` : ''}
          </Text>
        </View>
      </ScrollView>
    );
  }
}
