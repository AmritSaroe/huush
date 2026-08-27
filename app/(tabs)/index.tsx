import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";

export default function LibraryScreen() {
  return (
    <View style={styles.canvas}>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: "#F7F5EF",
    flex: 1,
  },
});
