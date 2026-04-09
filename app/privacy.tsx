import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, Text, View, Pressable, Linking } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';

export default function PrivacyPolicy() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ArrowLeft color="#FFFFFF" size={24} />
        </Pressable>
        <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 20, color: '#FFFFFF' }}>Privacy Policy</Text>
      </View>

      <ScrollView style={{ paddingHorizontal: 20 }}>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 13, color: '#888888', marginBottom: 20 }}>
          Effective as of 2026-04-09
        </Text>

        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 16 }}>
          This privacy policy applies to the Snipe Trivia app (hereby referred to as "Application") for mobile devices that was created by Agastya Mishra (hereby referred to as "Service Provider") as a Free service. This service is intended for use "AS IS".
        </Text>

        <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF', marginBottom: 10 }}>
          Information Collection and Use
        </Text>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 8 }}>
          The Application collects information when you download and use it. This information may include:
        </Text>
        <View style={{ paddingLeft: 16, marginBottom: 16 }}>
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 24 }}>
            {'\u2022'} Your device's Internet Protocol address (e.g. IP address)
          </Text>
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 24 }}>
            {'\u2022'} The pages of the Application that you visit, the time and date of your visit, the time spent on those pages
          </Text>
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 24 }}>
            {'\u2022'} The time spent on the Application
          </Text>
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 24 }}>
            {'\u2022'} The operating system you use on your mobile device
          </Text>
        </View>

        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 16 }}>
          The Application does not gather precise information about the location of your mobile device.
        </Text>

        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 16 }}>
          The Application does not use Artificial Intelligence (AI) technologies to process your data or provide features.
        </Text>

        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 16 }}>
          The Service Provider may use the information you provided to contact you from time to time to provide you with important information, required notices and marketing promotions.
        </Text>

        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 16 }}>
          For a better experience, while using the Application, the Service Provider may require you to provide us with certain personally identifiable information, including but not limited to agastyamishra2006@gmail.com. The information that the Service Provider request will be retained by them and used as described in this privacy policy.
        </Text>

        <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF', marginBottom: 10 }}>
          Third Party Access
        </Text>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 8 }}>
          Only aggregated, anonymized data is periodically transmitted to external services to aid the Service Provider in improving the Application and their service. The Service Provider may share your information with third parties in the ways that are described in this privacy statement.
        </Text>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 8 }}>
          The Application utilizes third-party services that have their own Privacy Policy about handling data:
        </Text>
        <View style={{ paddingLeft: 16, marginBottom: 16 }}>
          <Pressable onPress={() => Linking.openURL('https://firebase.google.com/support/privacy')}>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#60A5FA', lineHeight: 24, textDecorationLine: 'underline' }}>
              {'\u2022'} Google Analytics for Firebase
            </Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL('https://expo.io/privacy')}>
            <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#60A5FA', lineHeight: 24, textDecorationLine: 'underline' }}>
              {'\u2022'} Expo
            </Text>
          </Pressable>
        </View>

        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 8 }}>
          The Service Provider may disclose User Provided and Automatically Collected Information:
        </Text>
        <View style={{ paddingLeft: 16, marginBottom: 16 }}>
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 24 }}>
            {'\u2022'} As required by law, such as to comply with a subpoena, or similar legal process
          </Text>
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 24 }}>
            {'\u2022'} When they believe in good faith that disclosure is necessary to protect their rights, protect your safety or the safety of others, investigate fraud, or respond to a government request
          </Text>
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 24 }}>
            {'\u2022'} With their trusted services providers who work on their behalf, do not have an independent use of the information we disclose to them, and have agreed to adhere to the rules set forth in this privacy statement
          </Text>
        </View>

        <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF', marginBottom: 10 }}>
          Opt-Out Rights
        </Text>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 16 }}>
          You can stop all collection of information by the Application easily by uninstalling it. You may use the standard uninstall processes as may be available as part of your mobile device or via the mobile application marketplace or network.
        </Text>

        <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF', marginBottom: 10 }}>
          Data Retention Policy
        </Text>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 16 }}>
          The Service Provider will retain User Provided data for as long as you use the Application and for a reasonable time thereafter. If you'd like them to delete User Provided Data that you have provided via the Application, please contact them at agastyamishra2006@gmail.com and they will respond in a reasonable time.
        </Text>

        <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF', marginBottom: 10 }}>
          Children
        </Text>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 16 }}>
          The Service Provider does not use the Application to knowingly solicit data from or market to children under the age of 13. The Application does not address anyone under the age of 13. The Service Provider does not knowingly collect personally identifiable information from children under 13 years of age. In the case the Service Provider discover that a child under 13 has provided personal information, the Service Provider will immediately delete this from their servers. If you are a parent or guardian and you are aware that your child has provided us with personal information, please contact the Service Provider (agastyamishra2006@gmail.com) so that they will be able to take the necessary actions.
        </Text>

        <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF', marginBottom: 10 }}>
          Security
        </Text>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 16 }}>
          The Service Provider is concerned about safeguarding the confidentiality of your information. The Service Provider provides physical, electronic, and procedural safeguards to protect information the Service Provider processes and maintains.
        </Text>

        <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF', marginBottom: 10 }}>
          Changes
        </Text>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 16 }}>
          This Privacy Policy may be updated from time to time for any reason. The Service Provider will notify you of any changes to the Privacy Policy by updating this page with the new Privacy Policy. You are advised to consult this Privacy Policy regularly for any changes, as continued use is deemed approval of all changes.
        </Text>

        <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF', marginBottom: 10 }}>
          Your Consent
        </Text>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 16 }}>
          By using the Application, you are consenting to the processing of your information as set forth in this Privacy Policy now and as amended by us.
        </Text>

        <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 16, color: '#FFFFFF', marginBottom: 10 }}>
          Contact Us
        </Text>
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#CCCCCC', lineHeight: 22, marginBottom: 8 }}>
          If you have any questions regarding privacy while using the Application, or have questions about the practices, please contact the Service Provider via email at:
        </Text>
        <Pressable onPress={() => Linking.openURL('mailto:agastyamishra2006@gmail.com')}>
          <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 14, color: '#60A5FA', lineHeight: 22, textDecorationLine: 'underline', marginBottom: 16 }}>
            agastyamishra2006@gmail.com
          </Text>
        </Pressable>

        <View style={{ height: 1, backgroundColor: '#1A1A1A', marginVertical: 16 }} />
        <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 12, color: '#888888', marginBottom: 40 }}>
          This privacy policy page was generated by App Privacy Policy Generator.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
